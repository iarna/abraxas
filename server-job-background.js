"use strict";
var util = require('util');
var events = require('events');
var stream = require('stream');
var StreamReplay = require('./stream-replay');
var through = require('through2');

var UniqueJob = require('./server-job-multi');

var BgJob = module.exports = function (id, func, uniqueid, priority, body) {
    UniqueJob.call(this, id, func, uniqueid, priority, body);
    this.background = true;
}
util.inherits( BgJob, UniqueJob );

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
