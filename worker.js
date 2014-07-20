"use strict";
var packet = require('gearman-packet');
var stream = require('stream');
var util = require('util');
var WorkerTask = require('./task-worker');
/*
----- WORKER
Send:
    ALL_YOURS: {id: 24, args: []},
*/

exports.construct = function () {
    this._workers = {};
    this._workersCount = 0;

    this._activeJobs = {};
    this._activeJobsCount = 0;

    if (!this.options.maxJobs) {
        this.options.maxJobs = 1;
    }

    var self = this;
    this.packets.acceptDefault('NO_JOB', function(data) {
        if (!self.socket) return;
        self.socket.write({kind:'request',type:packet.types['PRE_SLEEP']});
    });

    this.packets.acceptDefault('NOOP', function(data) { self.askForWork() });
}
var Worker = exports.Worker = {};

Worker.setClientId = function (id) {
    self.socket.write({kind:'request',type:packet.types['SET_CLIENT_ID'], args:{workerid:id}});
}

// We defer this, so that the user has the oppportunity to register all of
// their workers
Worker.askForWork = function () {
    if (this.asked) return;
    this.asked = true;
    var self = this;
    setImmediate(function(){
        self.asked = false;
        if (!self.socket) return;
        self.socket.write({kind:'request',type:packet.types['GRAB_JOB_UNIQ']});
    });
}

Worker.startWork = function (jobid) {
    this._activeJobs[jobid] = true;
    if (this.options.maxJobs > ++ this._activeJobsCount) {
        this.askForWork();
    }
}

Worker.endWork = function (jobid) {
    delete this._activeJobs[jobid];
    if (this.options.maxJobs > -- this._activeJobsCount) {
        this.askForWork();
    }
}

Worker.unregisterWorker = function (func) {
    if (!this._workers[func]) {
        this.emit('warn', new Error("Unregistering worker "+func+" that's not registered, doing nothing"));
        return;
    }
    delete this._workers[func];
    if (-- this._workersCount == 0) {
        this.packets.removeListener('JOB_ASSIGN_UNIQ', this.onJobAssign);
        this.unref();
    }
    if (!this.connected) return;
    this.socket.write({kind:'request',type:packet.types['CANT_DO'],args:{functon: func}});
}

Worker.registerWorker = function (func, options, worker) {
    if (!worker) { worker=options; options={} }
    if (this._workers[func]) {
        this.emit('warn', new Error('Redefining worker for '+func));
    }
    else {
        if (this._workersCount++ == 0) {
            var self = this;
            this.ref();
            this.packets.on('JOB_ASSIGN_UNIQ', this.onJobAssign = function(job) { self.dispatchWorker(job) });
        }
    }
    if (options.timeout) {
        this.socket.write({kind:'request',type:packet.types['CAN_DO_TIMEOUT'], args:{function: func, timeout: options.timeout}});
    }
    else {
        this.socket.write({kind:'request',type:packet.types['CAN_DO'], args:{function: func}});
    }
    this._workers[func] = {options: options, handler: worker};
    this.askForWork();
    var self = this;
    return {
        function: func,
        unregister: function () { return self.unregisterWorker(func) },
        maxqueue: function (maxsize,callback) { return self.maxqueue(func,maxsize,callback) },
        status: function (callback) {
            if (callback) {
                return self.status().then(function (status) {
                    return callback(null,status.filter(function(W){ return W.function==func })[0]);
                })
                .catch(function(err) {
                    return callback(err);
                });
            }
            else {
                return self.status().then(function (status) { return status.filter(function(W){ return W.function==func })[0]; })
            }
        }
    };
}

Worker.forgetAllWorkers = function () {
    if (! this._workersCount) return;
    this._workers = {};
    this._workersCount = 0;
    this.packets.removeListener('JOB_ASSIGN_UNIQ', this.onJobAssign);
    this.unref();
    if (!this.connected) return;
    this.socket.write({kind:'request',type:packet.types['RESET_ABILITIES']});
}

Worker.dispatchWorker = function (job) {
    var self = this;
    var jobid = job.args.job;
    var worker = this._workers[job.args.function];
    if (!worker) return this.packets.emit('unknown',job);

    this.startWork(jobid);

    var options = {jobid: jobid, uniqueid: job.args.uniqueid, client: this};
    if (worker.options.encoding) options.encoding = worker.options.encoding;
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') options.encoding = null;
    if (options.encoding) job.body.setEncoding(options.encoding);
    var task = new WorkerTask(job.body,options);

    task.outbound.on('data', function (data) {
        if (!self.connected) return;
        self.socket.write({kind:'request',type:packet.types['WORK_DATA'], args:{job:jobid}, body:data});
    });

    var sendException = function (msg) {
        if (!self.connected) return;
        if (self.exceptions) {
            self.socket.write({kind:'request',type:packet.types['WORK_EXCEPTION'], args:{job:jobid}, body:msg});
        }
        else {
            self.socket.write({kind:'request',type:packet.types['WORK_WARNING'], args:{job:jobid}, body:msg});
            self.socket.write({kind:'request',type:packet.types['WORK_FAIL'], args:{job:jobid}});
        }
        self.endWork(jobid);
    }

    task.outbound.on('error', sendException);

    task.outbound.on('end', function () {
        if (self.connected) {
            var end = {kind:'request',type:packet.types['WORK_COMPLETE'], args:{job:jobid}};
            if (task.lastChunk) end.body = task.lastChunk;
            self.socket.write(end, options.encoding);
        }
        self.endWork(jobid);
    });
    
    try {
        var handleReturnValue = function (value) {
            if (value && value.pipe) {
                value.pipe(task);
                value.on('error', sendException);
            }
            else if (value && value.then) {
                value.then(handleReturnValue, sendException);
            }
            else if (value instanceof Error) {
                sendException(value);
            }
            else if (value != null) {
                task.end(value);
            }
        }

        handleReturnValue(worker.handler(task));
    }
    catch (error) {
        sendException(error);
    }
}
