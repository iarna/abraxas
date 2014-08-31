"use strict";
var Gearman = require('../index');

Gearman.Client.connect({connectTimeout: 20, servers: ['localhost','localhost:14730'], defaultEncoding: 'utf8'}, function (err,gm) {
    if (err) throw err;
    var start = process.hrtime();
    gm.registerWorker('slow',function (task) {
        setTimeout(function(){
            task.end(task.payload);
        }, 500);
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
    gm.submitJobBg('slow','wizzle').then(function(jobid) {
        console.log("GET STATUS",jobid);
        gm.getStatus(jobid,function(err,status) {
            console.log('JOB SPECIFIC STATUS',jobid,status);
        });
    });
    setTimeout(function() {
        gm.workers({responseTimeout: 50}).then(function(workers){
            console.log(workers);
        });
    }, 100);
});
