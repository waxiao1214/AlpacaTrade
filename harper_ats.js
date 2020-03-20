const Alpaca = require('@alpacahq/alpaca-trade-api');

module.exports = function( stocks ) {
    this.alpaca = new Alpaca({
        keyId: "PKK81RMCU2QBD3FED3PZ",
        secretKey: "0QBx6d60WjkvjgBKXSls4vGX5wxWcr2kQzVkjn6e",
        baseUrl: 'https://paper-api.alpaca.markets'
    });

    this.allStocks = stocks;
    var temp = [];
    this.allStocks.forEach((stockName) => {
        temp.push({name: stockName, pc: 0});
    });
    this.allStocks = temp.slice();
    // this.start_bid = 
    this.start_volumn = 100;
    this.take_profit = 2.5;
    this.stop_loss = 2.5;
    this.start_price = [ 19.96, 13.1, 77.6, 482.9, 149.79 ]
    this.bid_price = [];
    this.stock_volume = {};
    this.ask_price = [];
    this.stockmap = [];
    this.volumn = [];
    this.getTodayOpenClose = function() {
        return new Promise(async (resolve,reject) => {
            await this.alpaca.getClock().then(async (resp) => {
                await this.alpaca.getCalendar({
                    start: resp.timestamp,
                    end: resp.timestamp
                }).then((resp) => {
                var openTime = resp[0].open;
                var closeTime = resp[0].close;
                var calDate = resp[0].date;
        
                openTime = openTime.split(":");
                closeTime = closeTime.split(":");
                calDate = calDate.split("-");
        
                var offset = new Date(new Date().toLocaleString('en-US',{timeZone: 'America/New_York'})).getHours() - new Date().getHours();
        
                openTime = new Date(calDate[0],calDate[1]-1,calDate[2],openTime[0]-offset,openTime[1]);
                closeTime = new Date(calDate[0],calDate[1]-1,calDate[2],closeTime[0]-offset,closeTime[1]);
                resolve([openTime, closeTime]);
                });
            });
        });
    }

    this.awaitMarketOpen = function() {
        var prom = new Promise(async (resolve, reject) => {
          var isOpen = false;
          await this.alpaca.getClock().then(async (resp) => {
            if(resp.is_open) {
              resolve();
            }
            else {
              this.marketChecker = setInterval(async () => {
                await this.alpaca.getClock().then((resp) => {
                  isOpen = resp.is_open;
                  if(isOpen) {
                    clearInterval(this.marketChecker);
                    resolve();
                  } 
                  else {
                    var openTime = new Date(resp.next_open.substring(0, resp.next_close.length - 6));
                    var currTime = new Date(resp.timestamp.substring(0, resp.timestamp.length - 6));
                    this.timeToClose = Math.floor((openTime - currTime) / 1000 / 60);
                    console.log(this.timeToClose + " minutes til next market open.");
                  }
                }).catch((err) => {writeToEventLog(err);});
              }, 1000);
            }
          });
        });
        return prom;
    } 

    this.getTotalPrice = function( stocks ){
        var promp = []
        stocks.forEach(async (stock) =>{
            promp.push(new Promise(async (resolve, reject) => {
              await this.alpaca.getBars('minute', stock, {limit : 1 }).then((resp) => {
                  resolve(resp[stock][0])
              }).catch((err) => {console.log(err)});
            }));
        });
        return promp;
    }

    this.submitOrder = async function(quantity, stock, side){
      var prom = new Promise(async (resolve, reject) => {
        if(quantity > 0){
          await this.alpaca.createOrder({
            symbol: stock,
            qty: quantity,
            side: side,
            type: 'market',
            time_in_force: 'day',
          }).then((resp) => {
            console.log("createOrder : ", resp)
            resolve(true);
          }).catch((err) => {
            resolve(false);
          });
        }
        else {
          writeToEventLog("Quantity is <= 0, order of |" + quantity + " " + stock + " " + side + "| not sent.");
          resolve(true);
        }
      });
      return prom;        
    }

    this.startTrade = async function( stocks ) {
      var promp = this.getTotalPrice(stocks);
      // var realTimePrice = [];
      await Promise.all(promp).then((resp) => {
        this.bid_price = []
        resp.forEach((key) => {
            this.bid_price.push(key.h)
            this.ask_price.push(key.l)
            this.volumn.push(key.v)
        });
        for(x in this.bid_price){
          if( this.start_price[x] * 0.975 > this.bid_price[x]){
            this.stockmap[x] = 'stop'
          } else if (this.start_price[x] * 1.025 > this.bid_price[x]) {
            this.stockmap[x] = 'sell'
          } else {
            this.stockmap[x] = 'buy'
          }       
        }
      })
      var i = 0
      stocks.forEach( key => {
        console.log(key, this.stockmap[i])
        var promOrders = []
        promOrders.push(new Promise(async (resolve, reject) => {
          // if(!this.blacklist.has(stock)){
            var promSO = this.submitOrder(100, key, this.stockmap[i]);
            await promSO.then((resp) => {
              // if(resp) executed.push(stock);
              // else incomplete.push(stock);
              resolve(resp);
            });
          // }
          // else resolve();
        }));
        i++;
      });      
    }
} 
