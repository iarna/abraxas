"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var extend = require('util-extend');
var createJob = require('./server-job').create;
var ServerConnection = require('./server-connection');

var Server = module.exports = function (options) {
    if (!options) options = {};
    if (!options.socket) {
        throw new Error("Invalid arguments in Gearman Server constructor, must include a socket");
    }
    this.options = options;
    this.socket = options.socket;
    this.clients = {};
    this.clientMaxId = 0;
    this.workers = {};
    this.workersCount = {};
    this.jobs = {};
    var self = this;
    this.socket.once('error', function(msg) { self.emit('error', msg) });
    this.socket.on('connection',function(socket) { self.acceptConnection(socket) });
    events.EventEmitter.call(this);
}
util.inherits( Server, events.EventEmitter );

Server.listen = function (options, callback) {
    if (!options) options = {};
    var server = new net.Server();
    if (options.path) {
        server.listen(options.path, callback);
    }
    else if (options.handle) {
        server.listen(options.handle, callback);
    }
    else {
        if (!options.port) options.port = 4730;
        if (!options.host) options.host = 'localhost';
        server.listen(options.port, options.host, options.backlog, callback);
    }
    options.socket = server;
    return new Server(options, callback);
}

Server.prototype.shutdown = function () {
    this.socket.close();
}

Server.prototype.acceptConnection = function (socket) {
    var id = ++ this.clientMaxId;
    var options = {};
    extend( options, this.options );
    options.socket = socket;
    options.id     = id;
    var client = this.clients[id] = new ServerConnection(options);

    client.once('error',function(e) { client.destroy() });

    var self = this;
    ['add-worker', 'remove-worker', 'remove-all-workers', 'get-status', 'submit-job', 'grab-job',
     'work-complete', 'work-data', 'work-warning', 'work-exception',
     'update-status'].forEach(function(event) {
        var methodname = event.replace(/-([a-z])/g,function(match,p1){ return p1.toUpperCase() });
        var method = self[methodname];
        client.on(event, function () { method.apply(self,arguments) });
    });
    client.once('disconnect', function () { self.recordDisconnect(client) });
    client.on('sleeping', function () { process.nextTick(function() { self.wakeWorkers() }) });
}

Server.prototype.addWorker = function (func, client, options) {
    if (! this.workers[func]) { this.workers[func] = {}; this.workersCount[func] = 0 }
    if (this.workers[func][client.id]) {
        this.emit('warning', client.clientid+' registered '+func+' more than once');
    }
    else {
        client.addWorker(func);
        this.workers[func][client.id] = {client: client, options: options};;
        this.workersCount[func] ++;
    }
}

Server.prototype.removeWorker = function (func, client) {
    if (this.workers[func]) {
        delete this.workers[func][client.id];
        this.workersCount[func] --;
        client.removeWorker(func);
        return;
    }
    client.sendErrorNoSuchWorker(func);
}

Server.prototype.removeAllWorkers = function (client) {
    for (var func in client.workers) {
        this.removeWorker(func,client);
    }
}

Server.prototype.recordDisconnect = function (client) {
    var self = this;
    var wakeJobs = 0;
    Object.keys(this.jobs)
          .map( function(jobid)  { return self.jobs[jobid] })
          .filter( function(job) { return job.worker === client })
          .forEach( function(job) {
              if (! job.background && client.feature.streaming) {
                  job.sendWorkFail();
              }
              else {
                  job.worker = null;
                  ++ wakeJobs;
              }
          });
    if (wakeJobs) this.wakeWorkers();
    this.removeAllWorkers(client);
    client.getJobs().forEach(function(job) {
        job.removeClient(client);
    });
    delete this.clients[client.id];
}

Server.prototype.withJob = function(client,jobid,callback,nojobcallback) {
    var job = this.jobs[jobid];
    if (!job) {
        if (nojobcallback) { return nojobcallback.call(this) }
        return client.sendErrorNoSuchJob(jobid);
    }
    callback.call(this,job);
}

Server.prototype.getStatus = function (jobid,client) {
    var status
    this.withJob(client,jobid,function(job) {
        status = job.getStatus();
        status.known = 1;
        status.running  = job.hasWorker() ? 1 : 0;
    }, function () {
        status = {known: 0, running: 0, complete: 0, total: 0}
    });
    status.job = jobid;
    client.sendStatus(status);
}

Server.prototype.submitJob = function (args) {
    var self = this;
    if (args.client.feature.streaming && ! args.background && args.uniqueid != '' && args.uniqueid != null) {
        args.client.sendErrorNoUniqueFg();
        return;
    }
    var job;
    if (this.jobs['unique:'+args.uniqueid]) {
        job = this.jobs['unique:'+args.uniqueid];
    }
    else {
        job = createJob(args.function, args.background, args.uniqueid, args.priority, args.body);
        this.jobs[job.id] = job;
        job.on('no-clients',function() {
            delete self.jobs[job.id];
        });
        job.on('job-complete',function() {
            delete self.jobs[job.id];
        });
        process.nextTick(function() { self.wakeWorkers() });
    }
    args.client.sendJobCreated(job.id);
    args.client.addJob(job);
    job.addClient(args.client);
}

Server.prototype.wakeWorkers = function () {
    var todo = {};
    for (var jobid in this.jobs) {
        var job = this.jobs[jobid];
        if (job.worker) continue;
        todo[job.function] ++;
    }
    var clients = {};
    for (var func in todo) {
        if (!this.workers[func]) continue;
        for (var clientid in this.workers[func]) {
            if (this.clients[clientid].status != 'sleeping') continue;
            clients[clientid] ++;
        }
    }
    for (var clientid in clients) {
        this.clients[clientid].sendNoop();
    }
}

Server.prototype.grabJob = function (client,unique) {
    var self = this;
    var jobs = Object.keys(this.jobs).map(function(jobid){
        return self.jobs[jobid]
    }).filter(function(job) {
        return client.workers[job.function] && !job.worker;
    }).sort(function(A,B) {
        if (A.priority > B.priority) return -1;
        if (A.priority < B.priority) return 1;
        if (A.queued < B.queued) return -1;
        if (A.queued > B.queued) return 1;
        return 0;
    });
    if (jobs.length == 0) return client.sendNoJob();

    var job = jobs[0];
    job.worker = client;
    if (unique) {
        client.sendJobAssignUniq(job);
    }
    else {
        client.sendJobAssign(job);
    }
}

Server.prototype.workComplete = function (client,jobid,body) {
    this.withJob(client,jobid,function(job) {
        job.sendWorkComplete(body);
        delete this.jobs[jobid];
    });
}

Server.prototype.workData = function (client,jobid,body) {
    this.withJob(client,jobid,function(job) {
        job.sendWorkData(body);
    });
}

Server.prototype.workWarning = function (client,jobid,body) {
    this.withJob(client,jobid,function(job) {
        job.sendWorkWarning(body);
    });
}

Server.prototype.workException = function (client,jobid,body) {
    this.withJob(client,jobid,function(job) {
        if (job.client.feature.exceptions) {
            job.sendWorkException(body);
        }
        else {
            job.sendWorkWarning(body);
            job.sendWorkFail();
        }
        delete this.jobs[jobid];
    });
}

Server.prototype.workFail = function (client,jobid,body) {
    this.withJob(client,jobid,function(job) {
        job.sendWorkFail();
        delete this.jobs[jobid];
    });
}

Server.prototype.updateStatus = function (client,jobid,complete,total) {
    this.withJob(client,jobid,function(job) {
        job.sendWorkStatus(complete,total);
    });
}
