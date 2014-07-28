"use strict";
var util = require('util');
var events = require('events');
var streamToBuffer = require('./stream-to-buffer');

var PacketHandler = module.exports = function () {
    events.EventEmitter.call(this);
    this.defaultHandler = {};
    this.eventQueue = {};
    this.mapped = {};

    var self = this;
    this.queueEventListener = function (data) {
        var event = data.type.name;
        self.eventQueue[event].shift().apply(null,arguments);
        self.handleEmptyEventQueue(event);
    }
    this.acceptByJobEventListener = function(data) {
        var event = data.type.name;
        var id = data.args.job;
        if (self.mapped[event][id]) {
            self.mapped[event][id].forEach(function(cb){ cb(data) });
        }
        else {
            self.emit('unknown',data);
        }
    }
}
util.inherits(PacketHandler, events.EventEmitter);

PacketHandler.prototype.handleEmptyEventQueue = function(event) {
    if (this.eventQueue[event].length) return;
    if (this.defaultHandler[event]) {
        this.removeListener(event, this.queueEventListener);
        this.on(event, this.defaultHandler[event]);
    }
    else {
        this.removeListener(event, this.queueEventListener);
    }
}

PacketHandler.prototype.acceptDefault = function (event, callback) {
    if (this.defaultHandler[event]) throw new Error("Tried to register a second default handler for the "+event+" packet");
    this.defaultHandler[event] = callback;
    if (this.eventQueue[event] && this.eventQueue[event].length) return;
    this.on(event, this.defaultHandler[event]);
}

PacketHandler.prototype.removeDefault = function (event) {
    if (! this.defaultHandler[event]) throw new Error("Tried to remove a default handler for "+event+" but none was set");
    this.removeListener(event, this.defaultHandler[event]);
    delete this.defaultHandler[event];
}

PacketHandler.prototype.acceptSerial = function (event, callback) {
    if (!this.eventQueue[event]) this.eventQueue[event] = [];
    if (!this.eventQueue[event].length) {
        this.on(event, this.queueEventListener);
        if (this.defaultHandler[event]) this.removeListener(event, this.defaultHandler[event]);
    }
    this.eventQueue[event].push(callback);
}

PacketHandler.prototype.constructError = function (data,callback) {
    streamToBuffer(data.body,function(err,body) {
        var error = new Error(err ? err : body.toString());
        error.name = data.args['errorcode'];
        callback(error);
    });
}

PacketHandler.prototype.acceptSerialWithError = function (event, callback) {
    var self = this;
    var success = function (data) {
        self.unacceptSerial('ERROR', failure);
        callback(null, data);
    }
    var failure = function (data) {
        self.unacceptSerial(event, success);
        self.constructError(data, callback);
    }
    this.acceptSerial(event, success);
    this.acceptSerial('ERROR', failure);
}

PacketHandler.prototype.unacceptSerial = function (event, callback) {
    if (!this.eventQueue[event]) return;
    if (!this.eventQueue[event].length) return;
    this.eventQueue[event] = this.eventQueue[event].filter(function(handler) { return callback!==handler });
    this.handleEmptyEventQueue(event);
}

PacketHandler.prototype.acceptByJob = function (event, id, callback) {
    if (!this.mapped[event]) {
        this.mapped[event] = {};
        this.on(event, this.acceptByJobEventListener);
    }
    if (!this.mapped[event][id]) this.mapped[event][id] = [];
    this.mapped[event][id].push(callback);
}

PacketHandler.prototype.unacceptByJob = function (event, id, callback) {
    if (this.mapped[event]) {
        delete this.mapped[event][id];
    }
    if (Object.keys(this.mapped[event]).length == 0) {
        this.removeListener(event, this.acceptByJobEventListener);
    }
}

PacketHandler.prototype.acceptByJobOnce = function (event, id, callback) {
    var self = this;
    var success =  function(packet) {
        self.unacceptByJob(event, id);
        self.unacceptSerial('ERROR',failure);
        callback(null,packet);
    }
    var failure = function (packet) {
        self.unacceptByJob(event, id);
        self.constructError(packet, callback);
    }
    this.acceptByJob(event, id, success);
    this.acceptSerial('ERROR', failure);
}
