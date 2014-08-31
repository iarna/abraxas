"use strict";
var Promise = require('bluebird');
var concat = require('concat-stream');
var stream = require('readable-stream');
var util = require('util');
var Task = require('./task');

var WorkerTask = module.exports = function WorkerTask(payload,options) {
    if (!options) options = {};
    this.options   = options;
    this.jobid     = options.jobid;
    this.uniqueid  = options.uniqueid;
    this.client    = options.client;
    this.socket    = options.socket;
    this.lastChunk = null;
    this.payload   = null; // The payload value (non-stream)
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
    if (!this.socket.connected) return;
    this.socket.workWarning(this.jobid, msg);
}
WorkerTask.prototype.status = function (percent) {
    if (!this.socket.connected) return;
    this.socket.workStatus(this.jobid, percent);
}
WorkerTask.prototype.error = function (err) {
    if (!this.socket.connected) return;
    this.socket.workException(this.jobid,err);
    this.client.endWork(this.jobid);
}
