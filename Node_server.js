var http = require('http');
const READY = 0
const FIRSTFINISH = 100
const SECONDFINISH = 200
var Harper_ats = require ('./Harper_ats.js');
const stocks = ['DOMO', 'TLRY', 'SQ', 'MRO', 'AAPL'];
var harper_ats = new Harper_ats( stocks );
var tradeTime
var perform = READY

run =  async function() {
    timeOpenClose = await harper_ats.getTodayOpenClose()
    await harper_ats.awaitMarketOpen()
    console.log("Market is open");
    var currentTime = new Date();
    tradeTime = [[ new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 11, 15),
                   new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 13, 10) ],
                 [ new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 14, 25),
                   new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 15, 00) ]]
    
    if(( tradeTime[0][0] < currentTime  && tradeTime[0][1] > currentTime)){
        if( perform == READY ){
            await harper_ats.startTrade(stocks)
            perform = FIRSTFINISH;
        }
    }

    if(( tradeTime[1][0] < currentTime && tradeTime[1][1] > currentTime ))
        if( perform == FIRSTFINISH ){
            harper_ats.startTrade(stocks)
            perform = SECONDFINISH;
        }    
    
    if ( perform == SECONDFINISH ){
        console.log("Close all positions")
    }     
}

marketChecker = setInterval(async () => {
    await run();
},2000);




