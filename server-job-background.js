"use strict";
var util = require('util');
var events = require('events');
var stream = require('readable-stream');
var StreamReplay = require('./stream-replay');
var through = require('through2');

var MultiJob = require('./server-job-multi');

var BgJob = module.exports = function (id, func, uniqueid, priority, body) {
    MultiJob.call(this, id, func, uniqueid, priority, body);
    this.background = true;
}
util.inherits( BgJob, MultiJob );

BgJob.prototype.addClient = function(client) { }
BgJob.prototype.removeClient = function(client) { }
BgJob.prototype.sendWorkComplete = function(body) { body.resume(); this.emit('job-complete') }
BgJob.prototype.sendWorkData = function(body) { body.resume() }
BgJob.prototype.sendWorkWarning = function(body) { body.resume() }
BgJob.prototype.sendWorkException = function(body) { body.resume(); this.emit('job-complete') }
BgJob.prototype.sendWorkFail = function(body) { body.resume(); this.emit('job-complete') }
BgJob.prototype.sendWorkStatus = function(complete,total) {
    this.complete = complete;
    this.total = total;
}
