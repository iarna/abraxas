"use strict";
var util = require('util');
var stream = require('readable-stream');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError = require('./errors');

var id = 0;
var PacketHandler = module.exports = function () {
    this.id = ++ id;
    this.defaultHandler = {};
    this.serialHandler = {};
    this.handler = {};
    this.byJobHandler = {};
    stream.Writable.call(this,{objectMode: true})
}
util.inherits(PacketHandler, stream.Writable);

PacketHandler.prototype.toString = function () {
    return '[PacketHandler#'+this.id+']';
}

PacketHandler.prototype._write = function (packet, encoding, callback) {
    callback();
    var name = packet.type.name;
    if (packet.kind == 'admin') {
        name = 'ADMIN:'+name;
    }
    var job = packet.args.job;
    if (job && this.byJobHandler[job] && this.byJobHandler[job][name]) return this.byJobHandler[job][name](packet);
    if (this.handler[name]) return this.handler[name](packet);
    if (this.serialHandler[name] && this.serialHandler[name].length) return this.serialHandler[name].shift()(packet);
    if (this.defaultHandler[name]) return this.defaultHandler[name](packet);
    this.emit('unknown', packet);
}

PacketHandler.prototype.acceptDefault = function (event, callback) {
    if (this.defaultHandler[event]) throw "Tried to register a second default handler for the "+event+" packet";
    if (this.handler[event]) throw new Error("Tried to register default handler when we already have an accept-all handler for the "+event+" packet");
    this.defaultHandler[event] = callback;
}

PacketHandler.prototype.removeDefault = function (event) {
    if (! this.defaultHandler[event]) throw new Error("Tried to remove a default handler for "+event+" packet but none was set");
    delete this.defaultHandler[event];
}

PacketHandler.prototype.accept = function (event, callback) {
    if (this.defaultHandler[event]) throw new Error("Tried to register accept-all handler when we already have a default handler for the "+event+" packet");
    if (this.handler[event]) throw new Error("Tried to register a second accept-all handler for the "+event+" packet");
    this.handler[event] = callback;
}

PacketHandler.prototype.removeHandler = function (event) {
    if (! this.handler[event]) throw new Error("Tried to remove a default handler for "+event+" packet but none was set");
    delete this.handler[event];
}

PacketHandler.prototype.acceptSerial = function (event, callback) {
    if (this.handler[event]) throw new Error("Tried to register a serial handler when we already have an accept-all handler for the "+event+" packet");
    if (!this.serialHandler[event]) this.serialHandler[event] = [];
    this.serialHandler[event].push(callback);
}

PacketHandler.prototype.removeSerial = function (event, callback) {
    if (!this.serialHandler[event]) return;
    if (!this.serialHandler[event].length) return;
    this.serialHandler[event] = this.serialHandler[event].filter(function(handler) { return callback!==handler });
}

PacketHandler.prototype.acceptSerialWithError = function (event, callback) {
    var self = this;
    var success = function (data) {
        self.removeSerial('ERROR', failure);
        callback(null, data);
    }
    var failure = function (data) {
        self.removeSerial(event, success);
        self.constructError(data, callback);
    }
    this.acceptSerial(event, success);
    this.acceptSerial('ERROR', failure);
}

PacketHandler.prototype.acceptSerialAdminWithError = function (event, callback) {
    var self = this;
    var success = function (data) {
        self.removeSerial('ADMIN:error', failure);
        callback(null, data);
    }
    var failure = function (data) {
        self.removeSerial(event, success);
        self.constructError(data, callback);
    }
    this.acceptSerial(event, success);
    this.acceptSerial('ADMIN:error', failure);
}

PacketHandler.prototype.acceptByJob = function (event, id, callback) {
    if (!this.byJobHandler[id]) this.byJobHandler[id] = {};
    if (this.byJobHandler[id][event]) throw new Error("Tried to register job "+id+" handler for "+event+" packet");
    this.byJobHandler[id][event] = callback;
}

PacketHandler.prototype.removeByJob = function (event, id, callback) {
    if (!this.byJobHandler[id]) throw new Error("Tried to unregister "+event+" handler for job "+id+" but job doesn't exist");
    delete this.byJobHandler[id][event];
    if (!Object.keys(this.byJobHandler[id]).length) delete this.byJobHandler[id];
}

PacketHandler.prototype.acceptByJobOnce = function (event, id, callback) {
    var self = this;
    var success =  function(packet) {
        self.removeByJob(event, id);
        self.removeSerial('ERROR',failure);
        callback(null,packet);
    }
    var failure = function (packet) {
        self.removeByJob(event, id);
        self.constructError(packet, callback);
    }
    this.acceptByJob(event, id, success);
    this.acceptSerial('ERROR', failure);
}

PacketHandler.prototype.constructError = function (data,callback) {
    streamToBuffer(data.body,function(err,body) {
        if (err) {
            callback(new AbraxasError.Receive(err));
        }
        else {
            callback(new AbraxasError.Server(data.args.errorcode,body));
        }
    });
}
