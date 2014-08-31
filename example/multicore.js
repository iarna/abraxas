"use strict";
var Gearman = require('../index');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;
var concurrency = 10;
var options = {
    maxJobs: concurrency / numCPUs,
    servers: ['localhost','localhost:14730'],
    defaultEncoding: 'utf8',
};

if (cluster.isMaster) {
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died with '+signal);
        setTimeout(function(){ cluster.fork() },1000);
    });
}
else {
    var worker = Gearman.Client.connect(options);
    worker.registerWorker("add", function (task) {
        var num = task.payload.split(/ /).map(function(N){ return N|0 });
        task.end(num[0] + num[1]);
    });
}
