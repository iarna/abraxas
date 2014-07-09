"use strict";
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
    this.outbound  = new stream.PassThrough(options.response);
    if (options.encoding && (!options.response || !options.response.encoding)) {
        this.outbound.setEncoding(options.encoding);
    }
    Task.call(this,payload,this.outbound,options);
}
util.inherits(WorkerTask, Task);

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
