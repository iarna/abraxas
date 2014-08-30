"use strict";
var Gearman = require('../index');

Gearman.Client.connect({connectTimeout: 100, servers: ['localhost','localhost:14730'], defaultEncoding: 'utf8'}, function (err,gm) {
    if (err) throw err;
    var start = process.hrtime();
    gm.registerWorker('slow',function (task) {
        task.then(function(V){
            setTimeout(function(){
                task.end(V);
            }, 500);
        });
    });
    gm.submitJob('slow',{submitTimeout: 250}, 'test', function (err, value) {
        if (err) throw err;
        var time2 = process.hrtime();
        console.log(process.hrtime(start)[1]/1000000);
        console.log("Echoed:",value);
        gm.status({responseTimeout: 250},function(err,status) {
            console.log(process.hrtime(time2)[1]/1000000);
            console.log(status);
            gm.disconnect();
        });
    });
    setTimeout(function() {
        gm.workers({responseTimeout: 50}).then(function(workers){
            console.log(workers);
        });
        gm.status().then(function(status){
            console.log(status);
        })
    }, 100);
});
