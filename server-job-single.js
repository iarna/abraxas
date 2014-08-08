"use strict";
var util = require('util');
var events = require('events');
var StreamReplay = require('./stream-replay');
var client = require('./server-connection').prototype;

var SingleJob = module.exports = function (id, func, priority, body) {
    this.id = id;
    this.function = func;
    this.priority = priority;
    this.buffer = body.pipe(new StreamReplay());
    this.bufferSize = body.length;
    this.worker = null;
    this.complete = 0;
    this.total = 0;
    this.queued = new Date();
    events.EventEmitter.call(this);
}
util.inherits( SingleJob, events.EventEmitter );

SingleJob.prototype.addClient = function(client) {
    this.client = client;
}
SingleJob.prototype.removeClient = function(client) {
    this.client = null;
    this.emit('no-clients');
}

SingleJob.prototype.getBody = function () {
    var body = this.buffer.spawn();
    body.length = this.bufferSize;
    return body;
}

// This weird bit of indirection allows us to have another class that calls
// the same method on multiple classes.
SingleJob.prototype.call = function(method,args) {
    if (this.client==null) return;
    method.apply(this.client,args);
}

SingleJob.prototype.sendWorkComplete = function(body) {
    this.call(client.sendWorkComplete,[this.id,body]);;
    this.emit('job-complete');
}
SingleJob.prototype.sendWorkData = function(body) {
    this.call(client.sendWorkData,[this.id,body]);;
}
SingleJob.prototype.sendWorkWarning = function(body) {
    this.call(client.sendWorkWarning,[this.id,body]);;
}
SingleJob.prototype.sendWorkException = function(body) {
    this.call(client.sendWorkException,[this.id,body]);;
    this.emit('job-complete');
}
SingleJob.prototype.sendWorkFail = function(body) {
    this.call(client.sendWorkFail,[this.id,body]);;
    this.emit('job-complete');
}
SingleJob.prototype.sendWorkStatus = function(complete,total) {
    this.complete = complete;
    this.total = total;
    this.call(client.WorkStatus,[this.id,complete,total]);;
}
SingleJob.prototype.hasWorker = function () {
    return this.worker ? true : false;
}
SingleJob.prototype.getStatus = function () {
    return {complete: this.complete, total: this.total};
}
