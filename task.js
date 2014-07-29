"use strict";
var Promise = require('bluebird');
var concat = require('concat-stream');
var util = require('util');
var DuplexCombination = require('duplex-combination');

var Task = module.exports = function Task(reader,writer,options) {
    DuplexCombination.call(this,reader,writer,options);
}
util.inherits(Task, DuplexCombination);

Task.prototype._makePromise = function () {
    var self = this;
    this.promise = new Promise(function(resolve,reject) {
        self.pipe(concat(function(body) { resolve(body) }));
        self.once('error', function (err) { reject(err) });
    });
}

for (var name in Promise.prototype) { (function(name) {
    if (name.substr(0,1)=='_') return;
    var func = Promise.prototype[name];
    Task.prototype[name] = function () {
        if (! this.promise) this._makePromise();
        return func.apply(this.promise,arguments);
    }
})(name) }
