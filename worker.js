"use strict";
var packet = require('gearman-packet');
var toBuffer = packet.Emitter.prototype.toBuffer;
var stream = require('readable-stream');
var util = require('util');
var WorkerTask = require('./task-worker');
var ClientTask = require('./task-client');
var emptyFunction = require('emptyfunction');

exports.__construct = function (init) {
    this._workers = {};
    this._workersCount = 0;

    this._activeJobs = {};
    this._activeJobsCount = 0;

    this._grabbingJob = 0;

    this._clientId = null;

    if (!this.options.maxJobs) {
        this.options.maxJobs = 1;
    }
    this.on('connect', function (self, conn) {
        conn.socket.handleNoJob(function(data) {
            self._grabbingJob --;
            conn.socket.sleep();
        });

        conn.socket.handleNoOp(function(data) {
            conn.socket.wakeup();
            if (self.options.maxJobs > (self._activeJobsCount+self._grabbingJob)) {
                self._grabbingJob ++;
                conn.socket.grabJob();
            }
        });
        if (! self._workersCount) return;
        conn.socket.handleJobAssign(function(job) {
            self._grabbingJob --;
            self.dispatchWorker(job,conn.socket);
        });
        if (self._clientId) {
            conn.socket.setClientId(id);
        }
        for (var func in self._workers) {
            var worker = self._workers[func];
            if (! worker.handler) continue;
            conn.socket.canDo(func,worker.options.timeout);
            if (! worker.maxsize) continue;
            conn.socket.adminSingleResult('maxqueue '+func+(worker.maxsize?' '+worker.maxsize:''));
        }
        self.askForWork();
    });

}

var Worker = exports.Worker = {};

Worker.setClientId = function (id) {
    this._clientId = id;

    this.getConnectedServers().forEach(function(conn) {
        conn.socket.setClientId(id);
    });
}

Worker._worker = function (func) {
    if (! this._workers[func]) this._workers[func] = {};
    return this._workers[func] ? this._workers[func] : {};
}

Worker.maxqueue = function (func,maxsize,onComplete) {
    this._worker(func).maxsize = maxsize;
    var task = new ClientTask(onComplete);
    task.beginPartial();
    this.getConnectedServers().forEach(function(conn) {
        task.beginPartial();
        conn.adminSingleResult('maxqueue '+func+(maxsize?' '+maxsize:''), function() { task.endPartial() });
    });
    task.endPartial();
    return task;
}

// We defer this, so that the user has the oppportunity to register all of
// their workers
Worker.askForWork = function () {
    if (this.options.maxJobs <= this._activeJobsCount) return;
    if (this.askingForWork) return;
    this.askingForWork = true;
    var self = this;
    setImmediate(function(){
        self.askingForWork = false;
        self.getConnectedServers().forEach(function(conn) { conn.socket.sleep() });
    });
}

Worker.startWork = function (jobid) {
    this._activeJobs[jobid] = true;
    ++ this._activeJobsCount;
    this.askForWork();
}

Worker.endWork = function (jobid) {
    delete this._activeJobs[jobid];
    -- this._activeJobsCount;
    this.askForWork();
}

Worker.isRegistered = function (func) {
    return !! this._worker(func).handler;
}

Worker.unregisterWorker = function (func) {
    if (!this.isRegistered(func)) {
        this.emit('warn', new Error("Unregistering worker "+func+" that's not registered, doing nothing"));
        return;
    }
    this._worker(func).handler = null;
    if (-- this._workersCount == 0) {
        clearInterval(this.keepAlive);
        this.getConnectedServers().forEach(function(conn) {
            conn.socket.unhandleJobAssign();
        });
    }
    this.getConnectedServers().forEach(function(conn) {
        conn.socket.cantDo(func);
    });
}

Worker.registerWorker = function (func, options, handler) {
    if (!handler) { handler=options; options={} }
    this.registerWorkerStream(func,options,function (task) {
        return task.then(function(payload) {
            task.payload = payload;
            return handler(task);
        });
    });
}

Worker.registerWorkerStream = function (func, options, handler) {
    if (!handler) { handler=options; options={} }
    var self = this;
    if (this.isRegistered(func)) {
        this.emit('warn', new Error('Redefining worker for '+func));
    }
    else if (this._workersCount++ == 0) {
        this.keepAlive = setInterval(emptyFunction,86400);
        this.getConnectedServers().forEach(function(conn) {
            conn.socket.handleJobAssign(function(job) {
                self._grabbingJob --;
                self.dispatchWorker(job,conn.socket);
            });
        });
    }
    this.getConnectedServers().forEach(function(conn) {
        conn.socket.canDo(func,options.timeout);
    });
    this._worker(func).options = options;
    this._worker(func).handler = handler;
    this.askForWork();
    return {
        function: func,
        unregister: function () { return self.unregisterWorker(func) },
        maxqueue: function (maxsize,callback) { return self.maxqueue(func,maxsize,callback) },
        status: function (callback) {
            if (callback) {
                return self.status().then(function (status) {
                    process.nextTick(function(){ callback(null,status[func]) });
                })
                .catch(function(err) {
                    return callback(err);
                });
            }
            else {
                return self.status().then(function (status) { return status[func]; })
            }
        }
    };
}

Worker.forgetAllWorkers = function () {
    if (! this._workersCount) return;
    this._workers = {};
    this._workersCount = 0;
    clearInterval(this.keepAlive);
    this.getConnectedServers().forEach(function(conn) {
        conn.socket.unhandleJobAssign();
        conn.socket.resetAbilities();
    });
}

Worker.dispatchWorker = function (job,socket) {
    var self = this;
    var jobid = job.args.job;
    var worker = this._worker(job.args.function);
    if (!worker.handler) throw Error('Assigned job for worker we no longer have');

    this.startWork(jobid);

    var options = {jobid: jobid, uniqueid: job.args.uniqueid, client: this, socket: socket};
    if (worker.options.encoding) options.encoding = worker.options.encoding;
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') options.encoding = null;
    if (options.encoding) job.body.setEncoding(options.encoding);

    var task = new WorkerTask(job.body,options);

    if (socket.feature.streaming) {
        task.writer.on('data', function (data) {
            if (!socket.connected) return;
            socket.workData(jobid,data);
        });

        task.writer.once('end', function () {
            if (socket.connected) {
                socket.workComplete(jobid,task.lastChunk);
            }
            self.endWork(jobid);
        });
    }
    else {
        var buffer = new Buffer(0);
        var addToBuffer = function (thing) {
            buffer = Buffer.concat([buffer,toBuffer(thing)]);
        }
        task.writer.on('data', function (data) {
            if (!socket.connected) return;
            addToBuffer(data);
        });

        task.writer.once('end', function () {
            if (socket.connected) {
                if (task.lastChunk) addToBuffer(task.lastChunk);
                socket.workComplete(jobid,buffer);
            }
            self.endWork(jobid);
        });
    }
    
    try {
        var handleReturnValue = function (value) {
            if (value && value.pipe) {
                value.pipe(task);
                value.once('error', function (err) { task.error(err) });
            }
            else if (value && value.then) {
                value.then(handleReturnValue, function (err) { task.error(err) });
            }
            else if (value instanceof Error) {
                task.error(value);
            }
            else if (value != null) {
                task.end(value);
            }
        }

        handleReturnValue(worker.handler(task));
    }
    catch (error) {
        task.error(error);
    }
}
