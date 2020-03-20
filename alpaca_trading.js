const API_KEY = 'PKL6VCX3KFXQV5D4CQKO';
const API_SECRET = 'bA8pjTP7xI0NELZmCLhXuQf91aXuiShN90oPdQCH';
const PAPER = true;

class LongShort {
  constructor(API_KEY, API_SECRET, PAPER){
    this.Alpaca = require('@alpacahq/alpaca-trade-api');
    this.csvjson = require('csvjson');
    this.readFile = require('fs').readFile;
    this.writeFile = require('fs').writeFile;
    this.cron = require('node-cron');
    this.alpaca = new this.Alpaca({
      keyId: API_KEY, 
      secretKey: API_SECRET, 
      paper: PAPER
    });

    this.allStocks = [];
    this.bid_price = [];
    this.ask_price = [];
    this.stock_volume = [];
    this.startVolume = 100;
    this.start_comp = 7
    this.bid_start = [ 100, 162.22,181.53,5.81,149.34,76.65,2.325,120.18,39.95,1341.14, 69.29,62.55,1.925,115.86,34.07,82.035,85.56,45.465 ]
    this.buyStock = []
    this.sellStock = []
    this.logData;
    this.startTime;
    this.endTime;
    // Format the allStocks variable for use in the class.
    this.long = [];
    this.short = [];
    this.qShort = null;
    this.qLong = null;
    this.adjustedQLong = null;
    this.adjustedQShort = null;
    this.blacklist = new Set();
    this.longAmount = 0;
    this.shortAmount = 0;
    this.timeToClose = null;
  }

  async run(){
    var orders;
    await this.alpaca.getOrders({
      status: 'open', 
      direction: 'desc' 
    }).then((resp) => {
      orders = resp;
    }).catch((err) => {console.log(err.error);});
    var promOrders = [];
    orders.forEach((order) => {
      promOrders.push(new Promise(async (resolve, reject) => {
        await this.alpaca.cancelOrder(order.id).catch((err) => {console.log(err.error);});
        resolve();
      }));
    });
    await Promise.all(promOrders);

    // Wait for market to open.
    console.log("Waiting for market to open...");
    var promMarket = this.awaitMarketOpen();
    await promMarket;
    console.log("Market opened.");

    this.allStocks = await this.loadData('./stock.csv')

    var stockInfo = await this.getStockInfo(this.allStocks);
    this.bid_price = []
    this.ask_price = []
    this.stock_volume = []
    stockInfo.map(key => {
      this.bid_price.push(key[0].h)
      this.ask_price.push(key[0].l)
      this.stock_volume.push(key[0].v)
    })

    var current_comp = 0
    await this.alpaca.getBars('minute', 'ZIXI', {limit: 1}).then( resp => {
        current_comp = resp.ZIXI[0].h
    }).catch((err) => {console.log(err.error);});
    if(current_comp < this.start_comp)
      return
      
    var time_in_force = "day"
    for(var index = 0; index < this.allStocks.length; index++) {
      await this.alpaca.getPosition(this.allStocks[index].symbol).then(async (resp) => {
        var promClose = [];
          promClose.push(new Promise(async (resolve, reject) => {
            var orderSide;
            var trade = true;
            if(resp.avg_entry_price * ( 1 - this.allStocks[index].stop_loss / 100 ) == resp.current_price) {
              trade = false;
            }
            if(resp.avg_entry_price * ( 1 - this.allStocks[index].stop_loss / 100 ) < resp.current_price) {
              time_in_force = "gtc"
            } else {
              if(resp.side == 'long'){
                time_in_force = "day"
              }
            }
            orderSide = 'sell';
            if(trade){
              var quantity = Math.abs(resp.qty);
              console.log(quantity)
              await this.submitOrder(quantity, this.allStocks[index].symbol, orderSide, time_in_force);
            }
            resolve();
          }));
        await Promise.all(promClose);
      }).catch(async (err) => {
        var quantity = this.startVolume;
        var orderSide = 'buy';
        var time_in_force = 'day';
        await this.submitOrder(quantity, this.allStocks[index].symbol, orderSide, time_in_force);
      });
    }

      var bid;
      var ask;
      var volume;
      await this.alpaca.getBars('minute', 'SPY', {limit: 1}).then( resp => {
        var bid  = resp.SPY[0].h;
        var ask  = resp.SPY[0].l;
        var volume = resp.SPY[0].v;
      }).catch((err) => {console.log(err.error);});


      // Figure out when the market will close so we can prepare to sell beforehand.
      await this.alpaca.getClock().then((resp) => {
        var closingTime = new Date(resp.next_close.substring(0, resp.next_close.length - 6));
        var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
        this.timeToClose = Math.abs(closingTime - currTime);
      }).catch((err) => {console.log(err.error);});

      // if(this.timeToClose < (60000 * 15)) {
      //   // Close all positions when 15 minutes til market close.
      //   console.log("Market closing soon.  Closing positions.");
        
      //   await this.alpaca.getPositions().then(async (resp) => {
      //     var promClose = [];
      //     resp.forEach((position) => {
      //       promClose.push(new Promise(async (resolve, reject) => {
      //         var orderSide;
      //         if(position.side == 'long') orderSide = 'sell';
      //         else orderSide = 'buy';
      //         var quantity = Math.abs(position.qty);
      //         await this.submitOrder(quantity, position.symbol, orderSide);
      //         resolve();
      //       }));
      //     });
          
      //     await Promise.all(promClose);
      //   }).catch((err) => {console.log(err.error);});
      //   clearInterval(spin);
      //   console.log("Sleeping until market close (15 minutes).");
      //   setTimeout(() => {
      //     // Run script again after market close for next trading day.
      //     this.run();
      //   }, 60000*15);
      // }
      // else {
      //   // Rebalance the portfolio.
      //   // await this.rebalance();

      // }

      // await this.alpaca.getPositions().then(async (resp) => {
      //   var promPrices = this.getTotalPrice(resp);
      //   await Promise.all(promPrices).then((resp) => {
      //     var completeTotal = resp.reduce((a, b) => a + b, 0);
      //     if(completeTotal != 0){
      //       if(i == 0){
      //         this.adjustedQLong = Math.floor(this.longAmount / completeTotal);
      //       }
      //       else{
      //         this.adjustedQShort = Math.floor(this.shortAmount / completeTotal);
      //       }
      //     }
      //   });
      // }).catch(async (err) => {
        
      // });
  }

  loadData(fileName) {
    return new Promise((resolve, reject) => {
      this.readFile(fileName, 'utf8', function (error, datas) {
        if (error) return reject(error);
        datas = datas.split("\r\n");
        var temp = []
        var i = 0
        var jsonData = []
        datas.forEach((data) => {
          data = data.split(",")
          temp.push(data)
          if(i > 0){
            var j = 0
            var jsonObj = {}
            temp[0].forEach(key => {
              jsonObj[key] = temp[i][j]
              j++
            })
            jsonData.push(jsonObj)
          }
          i++
        })
        jsonData.pop()
        resolve(jsonData);
      })  
    });
  }

  saveData(filename){
    var fileContent = this.logData
    const csvData = this.csvjson.toCSV(fileContent, {
        headers: 'key'
    });
    this.writeFile(filename, csvData, (err) => {
        if(err) {
            console.log(err); // Do something to handle the error or just throw it
            return false
        }
        console.log('Success!');
        return true
    });
  }
  // Spin until the market is open
  awaitMarketOpen(){
    var prom = new Promise(async (resolve, reject) => {
      var isOpen = false;
      await this.alpaca.getClock().then(async (resp) => {
        console.log(resp.is_open);
        if(resp.is_open) {
          resolve();
        }
        else {
          var marketChecker = setInterval(async () => {
            await this.alpaca.getClock().then((resp) => {
              isOpen = resp.is_open;
              if(isOpen) {
                clearInterval(marketChecker);
                resolve();
              } 
              else {
                var openTime = new Date(resp.next_open.substring(0, resp.next_close.length - 6));
                var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
                this.timeToClose = Math.floor((openTime - currTime) / 1000 / 60);
                console.log(this.timeToClose + " minutes til next market open.")
              }
            }).catch((err) => {console.log(err.error);});
          }, 60000);
        }
      });
    });
    return prom;
  }

  async getStockInfo(stocks){
    var proms = [];
    stocks.forEach( async stock => {
      proms.push(new Promise(async (resolve, reject) => {
        await this.alpaca.getBars('minute', stock.symbol, {limit: 1}).then( resp => {
          resolve(resp[stock.symbol])
        }).catch((err) => {console.log(err.error);});
      }));
    });
    return await Promise.all(proms)
  }

  // Rebalance our position after an update.
  async rebalance(){
    await this.rerank();
    
    // Clear existing orders again.
    var orders;
    await this.alpaca.getOrders({
      status: 'open', 
      direction: 'desc'
    }).then((resp) => {
      orders = resp;
    }).catch((err) => {console.log(err.error);});
    var promOrders = [];
    orders.forEach((order) => {
      promOrders.push(new Promise(async (resolve, reject) => {
        await this.alpaca.cancelOrder(order.id).catch((err) => {console.log(err.error);});
        resolve();
      }));
    });
    await Promise.all(promOrders);


    console.log("We are taking a long position in: " + this.long.toString());
    console.log("We are taking a short position in: " + this.short.toString());
    // Remove positions that are no longer in the short or long list, and make a list of positions that do not need to change.  Adjust position quantities if needed.
    var positions;
    await this.alpaca.getPositions().then((resp) => {
      positions = resp;
    }).catch((err) => {console.log(err.error);});
    
    var promPositions = [];
    var executed = {long:[], short:[]};
    var side;
    this.blacklist.clear();
    positions.forEach((position) => {
      promPositions.push(new Promise(async (resolve, reject) => {
        if(this.long.indexOf(position.symbol) < 0){
          // Position is not in long list.
          if(this.short.indexOf(position.symbol) < 0){
            // Position not in short list either.  Clear position.
            if(position.side == "long") side = "sell";
            else side = "buy";
            var promCO = this.submitOrder(Math.abs(position.qty), position.symbol, side);
            await promCO.then(() => {
              resolve();
            });
          }
          else{
            // Position in short list.
            if(position.side == "long") {
              // Position changed from long to short.  Clear long position and short instead
              var promCS = this.submitOrder(position.qty, position.symbol, "sell");
              await promCS.then(() => {
                resolve();
              });
            }
            else {
              if(Math.abs(position.qty) == this.qShort){
                // Position is where we want it.  Pass for now.
              }
              else{
                // Need to adjust position amount
                var diff = Number(Math.abs(position.qty)) - Number(this.qShort);
                if(diff > 0){
                  // Too many short positions.  Buy some back to rebalance.
                  side = "buy";
                }
                else{
                  // Too little short positions.  Sell some more.
                  side = "sell";
                }
                var promRebalance = this.submitOrder(Math.abs(diff), position.symbol, side);
                await promRebalance;
              }
              executed.short.push(position.symbol);
              this.blacklist.add(position.symbol);
              resolve();
            }
          }
        }
        else{
          // Position in long list.
          if(position.side == "short"){
            // Position changed from short to long.  Clear short position and long instead.
            var promCS = this.submitOrder(Math.abs(position.qty), position.symbol, "buy");
            await promCS.then(() => {
              resolve();
            });
          }
          else{
            if(position.qty == this.qLong){
              // Position is where we want it.  Pass for now.
            }
            else{
              // Need to adjust position amount.
              var diff = Number(position.qty) - Number(this.qLong);
              if(diff > 0){
                // Too many long positions.  Sell some to rebalance.
                side = "sell";
              }
              else{
                // Too little long positions.  Buy some more.
                side = "buy";
              }
              var promRebalance = this.submitOrder(Math.abs(diff), position.symbol, side);
              await promRebalance;
            }
            executed.long.push(position.symbol);
            this.blacklist.add(position.symbol);
            resolve();
          }
        }
      }));
    });
    await Promise.all(promPositions);

    // Send orders to all remaining stocks in the long and short list.
    var promLong = this.sendBatchOrder(this.qLong, this.long, 'buy');
    var promShort = this.sendBatchOrder(this.qShort, this.short, 'sell');

    var promBatches = [];
    this.adjustedQLong = -1;
    this.adjustedQShort = -1;
    
    await Promise.all([promLong, promShort]).then(async (resp) => {
      // Handle rejected/incomplete orders.
      resp.forEach(async (arrays, i) => {
        promBatches.push(new Promise(async (resolve, reject) => {
          if(i == 0) {
            arrays[1] = arrays[1].concat(executed.long);
            executed.long = arrays[1].slice();
          }
          else {
            arrays[1] = arrays[1].concat(executed.short);
            executed.short = arrays[1].slice();
          }
          // Return orders that didn't complete, and determine new quantities to purchase.
          if(arrays[0].length > 0 && arrays[1].length > 0) {
            var promPrices = this.getTotalPrice(arrays[1]);
            await Promise.all(promPrices).then((resp) => {
              var completeTotal = resp.reduce((a, b) => a + b, 0);
              if(completeTotal != 0){
                if(i == 0){
                  this.adjustedQLong = Math.floor(this.longAmount / completeTotal);
                }
                else{
                  this.adjustedQShort = Math.floor(this.shortAmount / completeTotal);
                }
              }
            });
          }
          resolve();
        }));
      });
      await Promise.all(promBatches);
    }).then(async () => {
      // Reorder stocks that didn't throw an error so that the equity quota is reached.
      var promReorder = new Promise(async (resolve, reject) => {
        var promLong = [];
        if(this.adjustedQLong >= 0){
          this.qLong = this.adjustedQLong - this.qLong;
          executed.long.forEach(async (stock) => {
            promLong.push(new Promise(async (resolve, reject) => {
              var promLong = this.submitOrder(this.qLong, stock, 'buy');
              await promLong;
              resolve();
            })); 
          });
        }
        
        var promShort = [];
        if(this.adjustedQShort >= 0){
          this.qShort = this.adjustedQShort - this.qShort;
          executed.short.forEach(async(stock) => {
            promShort.push(new Promise(async (resolve, reject) => {
              var promShort = this.submitOrder(this.qShort, stock, 'sell');
              await promShort;
              resolve();
            }));
          });
        }
        var allProms = promLong.concat(promShort);
        if(allProms.length > 0){
          await Promise.all(allProms);
        }
        resolve();
      });
      await promReorder;
    });
  }

  // Get the total price of the array of input stocks.
  getTotalPrice(stocks){
    var proms = [];
    stocks.forEach(async (stock) => {
      proms.push(new Promise(async (resolve, reject) => {
        await this.alpaca.getBars('minute', stock, {limit: 1}).then((resp) => {
          resolve(resp[stock][0].c);
        }).catch((err) => {console.log(err.error);});
      }));
    });
    return proms;
  }

  // Submit an order if quantity is above 0.
  async submitOrder(quantity, stock, side, time_in_force){
    var prom = new Promise(async (resolve,reject) => {
      if(quantity > 0){
        await this.alpaca.createOrder({
          symbol: stock,
          qty: quantity,
          side: side,
          type: 'market',
          time_in_force: time_in_force,
        }).then(() => {
          console.log("Market order of | " + quantity + " " + stock + " " + side + " | completed.");
          resolve(true);
        }).catch((err) => {
          console.log("Order of | " + quantity + " " + stock + " " + side + " | did not go through.");
          resolve(false);
        });
      }
      else {
        console.log("Quantity is <=0, order of | " + quantity + " " + stock + " " + side + " | not sent.");
        resolve(true);
      }
    });
    return prom;
  }

  // Submit a batch order that returns completed and uncompleted orders.
  async sendBatchOrder(quantity, stocks, side, time_in_force){
    var prom = new Promise(async (resolve, reject) => {
      var incomplete = [];
      var executed = [];
      var promOrders = [];

      stocks.forEach(async (stock) => {
        promOrders.push(new Promise(async (resolve, reject) => {
          if(!this.blacklist.has(stock)) {
            var promSO = this.submitOrder(quantity, stock, side, time_in_force);
            await promSO.then((resp) => {
              if(resp) executed.push(stock);
              else incomplete.push(stock);
              resolve();
            });
          }
          else resolve();
        }));
      });
      await Promise.all(promOrders).then(() => {
        resolve([incomplete, executed]);
      });
    });
    return prom;
  }

  // Get percent changes of the stock prices over the past 10 minutes.
  getPercentChanges(allStocks){
    var length = 10;
    var promStocks = [];
    allStocks.forEach((stock) => {
      promStocks.push(new Promise(async (resolve, reject) => {
        await this.alpaca.getBars('minute', stock.name, {limit: length}).then((resp) => {
          stock.pc  = (resp[stock.name][length - 1].c - resp[stock.name][0].o) / resp[stock.name][0].o;
        }).catch((err) => {console.log(err.error);});
        resolve();
      }));
    });
    return promStocks;
  }
}

// Run the LongShort class
var ls = new LongShort(API_KEY, API_SECRET, PAPER);
ls.run();