"use strict";
var util = require('util');
var events = require('events');
var stream = require('readable-stream');
var through = require('through2');

var SingleJob = require('./server-job-single');

var MultiJob = module.exports = function (id, func, uniqueid, priority, body) {
    SingleJob.call(this, id, func, priority, body);
    this.uniqueid = uniqueid;
    this.output = [];
}
util.inherits( MultiJob, SingleJob );

MultiJob.prototype.addClient = function(client) {
    this.output.push(client);
}
MultiJob.prototype.removeClient = function(client) {
    this.output = this.output.filter(function(C){ return C !== client });
    if (!this.output.length) {
        this.emit('no-clients');
    }
}

MultiJob.prototype.call = function(method,args) {
    this.output.forEach(function(O){ method.apply(O,args) });
}
