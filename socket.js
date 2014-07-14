"use strict";
var net = require('net');
var util = require('util');
var through = require('through2');
var events = require('events');
var packet = require('gearman-packet');
var PacketHandler = require('./packet-handler');
var debugPacket = require('./debug-packet');

var AbraxasSocket = module.exports = function (options) {
    if (!options) options = {};
    if (!options.socket) {
        throw new Error("Invalid arguments in AbraxasSocket Gearman constructor, must include a socket");
    }

    this.options = options;
    var packets = this.packets = new PacketHandler();
    
    if (this.options.debug) {
        this.on('unknown-packet',function(name, packet){ console.error('Unknown packet',name,'=',debugPacket(packet)) });
    }

    if (!this.options.defaultEncoding) {
        this.options.defaultEncoding = null;
    }

    var self = this;

    this.connection = options.socket;

    this.connection.setNoDelay(true);
    this.connection.setKeepAlive(true);

    this.refCount = 0;
    this.connection.unref();

    if (this.connection.remoteAddress) {
        this.clientid = (net.isIPv4(this.connection.remoteAddress)?this.connection.remoteAddress:'['+this.connection.remoteAddress+']') + ':' + this.connection.remotePort;
    }
    else {
        this.clientid = "...connecting...";
        this.connection.on('connect',function () {
            self.clientid = (net.isIPv4(self.connection.localAddress)?self.connection.localAddress:'['+self.connection.localAddress+']') + ':' + self.connection.localPort;
        });
    }
    this.connection.on('error', function(error){ self.emitError(new Error("Socket error: "+error)) });
    this.connection.on('end', function(){ self.emit('disconnect') });

    var input = this.connection;
    var output;

    function observe(stream,func) {
        if (!func) { func = stream; stream = null }
        var passthrough = function(data,enc,done){ func.apply(null,arguments); this.push(data,enc); done(); };
        if (stream) {
            var thr = stream._readableState.objectMode ? through.obj : through;
            return stream.pipe(thr(passthrough));
        }
        else {
            return through.obj(passthrough);
        }
    }

    if (this.options.trafficDump) input = observe(input,function(D){ self.emitRead(D) });
    if (this.options.packetDump) output = observe(function(D){ self.emitWrite(D) });

    input = input.pipe(new packet.Parser());
    input.on('error', function(error){ self.emitError(new Error("Parser error: "+error)) });
    var emitter = new packet.Emitter();
    this.socket = output ? output : emitter;
    if (output) output.pipe(emitter);
    output = emitter;
    output.on('error', function(error){ self.emitError(new Error("Emitter error: "+error)) });

    if (this.options.packetDump) input = observe(input,function(D){ self.emitRead(D) });
    if (this.options.trafficDump) output = observe(output,function(D){ self.emitWrite(D) });

    output.pipe(this.connection);

    var self = this;

    input.on('data',function(data){
        if (events.EventEmitter.listenerCount(self.packets,data.type.name)) return self.packets.emit(data.type.name, data);
        self.emit('unknown-packet', data.type.name, data);
    });

    events.EventEmitter.call(this);
}
util.inherits( AbraxasSocket, events.EventEmitter );

AbraxasSocket.prototype.disconnect = function () {
    if (this.socket) this.socket.end();
    if (this.connection) this.connection.end();
    this.socket = this.connection = null;
}

AbraxasSocket.prototype.destroy = function () {
    if (this.connection) this.connection.destroy();
    this.socket = this.connection = null;
}


AbraxasSocket.prototype.emitError = function (error) {
    if (events.EventEmitter.listenerCount(this,'error')) return this.emit('error',error);
    throw error;
}

AbraxasSocket.prototype.emitUnknownPacket = function (packet) {
    if (events.EventEmitter.listenerCount(this,'unknown-packet')) return this.emit('unknown-packet',error);
}

AbraxasSocket.prototype.emitRead = function (stuff) {
    if (events.EventEmitter.listenerCount(this,'read')) return this.emit('read',stuff);
    console.error(this.clientid,'READ',Buffer.isBuffer(stuff)?stuff:debugPacket(stuff));
}

AbraxasSocket.prototype.emitWrite = function (stuff) {
    if (events.EventEmitter.listenerCount(this,'write')) return this.emit('write',stuff);
    console.error(this.clientid,'WRITE',Buffer.isBuffer(stuff)?stuff:debugPacket(stuff));
}

AbraxasSocket.prototype.ref = function () {
    if (this.refCount++ == 0) { this.connection.ref() }
}

AbraxasSocket.prototype.unref = function () {
    if (--this.refCount == 0) { this.connection.unref() }
}