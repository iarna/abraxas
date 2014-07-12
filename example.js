var Gearman = require('./index.js');
var client = Gearman.Client.connect({ host:'127.0.0.1', port:4730, defaultEncoding:'utf8', debug: true, maxJobs: 2 });

client.registerWorker("toUpper", function(task) {
    task.then(function(payload) {
        setTimeout(function(){
            task.end(payload.toUpperCase());
        }, 1000);
    });
});

[1,2,3,4,5].forEach(function(v) {

    client.submitJob('toUpper', {encoding: 'utf8',uniqueid:'test'+v}, 'test string '+v,function(err,result) {
        if (err) { throw err }
        console.log(new Date(),"Upper:", result);
        if (v==5) client.forgetAllWorkers();
    });

});