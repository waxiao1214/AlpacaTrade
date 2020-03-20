var cron = require("node-cron")

var x = "1-59"
cron.schedule( x + " * * * * *", () =>{
    console.log("-----------")
})