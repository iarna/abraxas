"use strict";
var util = require('util');
var events = require('events');
var buffr = require('buffr');

var Job = module.exports = function (id, func, priority, body) {
    this.id = id;
    this.function = func;
    this.priority = priority;
    this.body = body.pipe(buffr());
    this.body.length = body.length;
    this.worker = null;
    this.complete = 0;
    this.total = 0;
    this.queued = new Date();
    events.EventEmitter.call(this);
}
util.inherits( Job, events.EventEmitter );

Job.prototype.addClient = function(client) {
    this.client = client;
}
Job.prototype.removeClient = function(client) {
    this.client = null;
    this.emit('no-clients');
}
Job.prototype.sendWorkComplete = function(body) {
    this.client.sendWorkComplete(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkData = function(body) {
    this.client.sendWorkData(this.id,body);
}
Job.prototype.sendWorkWarning = function(body) {
    this.client.sendWorkWarning(this.id,body);
}
Job.prototype.sendWorkException = function(body) {
    this.client.sendWorkException(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkFail = function(body) {
    this.client.sendWorkFail(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkStatus = function(complete,total) {
    this.complete = complete;
    this.total = total;
    this.client.WorkStatus(this.id,complete,total);
}
Job.prototype.hasWorker = function () {
    return this.worker ? true : false;
}
Job.prototype.getStatus = function () {
    return {complete: this.complete, total: this.total};
}
