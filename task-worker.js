"use strict";
var Promise = require('bluebird');
var concat = require('concat-stream');
var stream = require('stream');
var util = require('util');
var packet = require('gearman-packet');
var Task = require('./task');

var WorkerTask = module.exports = function WorkerTask(payload,options) {
    if (!options) options = {};
    this.options   = options;
    this.jobid     = options.jobid;
    this.uniqueid  = options.uniqueid;
    this.client    = options.client;
    this.lastChunk = null;
    this.length    = payload.length;
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') delete options.encoding;
    if (options.encoding) {
        payload.setEncoding(options.encoding);
    }
    var outbound = new stream.PassThrough(options.response);
    if (options.encoding && (!options.response || !options.response.encoding)) {
        outbound.setEncoding(options.encoding);
    }
    Task.call(this,payload,outbound,options);
}
util.inherits(WorkerTask, Task);

WorkerTask.prototype._makePromise = function () {
    var self = this;
    this.promise = new Promise(function(resolve,reject) {
        if (self.listeners('error')==0) {
            self.reader.removeAllListeners('error');
        }
        self.pipe(concat(function(body) { resolve(body) }));
        self.reader.once('error', function (err) { reject(err) });
    });
}

WorkerTask.prototype.end = function (data) {
    if (this.lastChunk != null) return;
    this.lastChunk = data;
    Task.prototype.end.call(this);
}
WorkerTask.prototype.warn = function (msg) {
    this.client.socket.write({kind:'request',type:packet.types['WORK_WARNING'], args:{job:this.jobid}, body:msg});
}
WorkerTask.prototype.status = function (percent) {
    this.client.socket.write({kind:'request',type:packet.types['WORK_STATUS'], args:{job:this.jobid, complete:percent*100, total: 100}});
}
WorkerTask.prototype.error = function (err) {
    if (!this.client.connected) return;
    if (this.client.feature.exceptions) {
        this.client.socket.write({kind:'request',type:packet.types['WORK_EXCEPTION'], args:{job:this.jobid}, body:err});
    }
    else {
        this.client.socket.write({kind:'request',type:packet.types['WORK_WARNING'], args:{job:this.jobid}, body:err});
        this.client.socket.write({kind:'request',type:packet.types['WORK_FAIL'], args:{job:this.jobid}});
    }
    this.client.endWork(this.jobid);
}
