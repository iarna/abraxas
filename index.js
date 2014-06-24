"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var packet = require('gearman-packet');
var through = require('through2');
var extend = require('util-extend');
var PacketHandler = require('./packet-handler');
var debugPacket = require('./debug-packet');
var ClientTask = require('./task-client');
var streamToBuffer = require('./stream-to-buffer');

var Abraxas = exports.Client = function (options) {
    if (!options.socket) {
        throw new Error("Invalid arguments in Abraxas Gearman constructor, must include a socket");
    }

    this.options = options;
    this.asked = false;
    this.connection = null;
    var packets = this.packets = new PacketHandler();
    
    if (this.options.debug) {
        this.on('unknown-packet',function(name, packet){ console.error('Unknown packet',name,'=',debugPacket(packet)) });
    }

    if (!this.options.defaultEncoding) {
        this.options.defaultEncoding = null;
    }

    var self = this;

    packets.acceptDefault('ERROR', function (data) {
        streamToBuffer(data.body,function(err, body) {
            var error = new Error(err ? err : body.toString());
            error.name = data.args['errorcode'];
            self.emitError(error);
        });
    });

    this.connection = options.socket;
    this.connection.on('error', function(error){ self.emitError(new Error("Socket error: "+error)) });

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
    var emitter = new packet.Emitter();
    this.socket = output ? output : emitter;
    if (output) output.pipe(emitter);
    output = emitter;

    if (this.options.packetDump) input = observe(input,function(D){ self.emitRead(D) });
    if (this.options.trafficDump) output = observe(output,function(D){ self.emitWrite(D) });

    output.pipe(this.connection);

    var self = this;

    input.on('data',function(data){
        if (events.EventEmitter.listenerCount(self.packets,data.type.name)) return self.packets.emit(data.type.name, data);
        self.emit('unknown-packet', data.type.name, data);
    });

    this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'exceptions'}});
    this.packets.acceptSerial('OPTION_RES', function (data) {
        if (data.args.option == 'exceptions') {
            self.exceptions = true;
        }
    });

    events.EventEmitter.call(this);
    require('./worker').construct.call(this);
}
util.inherits( Abraxas, events.EventEmitter );

extend( Abraxas.prototype, require('./echo') );
extend( Abraxas.prototype, require('./admin') );
extend( Abraxas.prototype, require('./client') );
extend( Abraxas.prototype, require('./worker').Worker );

Abraxas.connect = function(options,callback) {
    if (!callback && typeof options == 'function') {
        callback = options; options = null;
    }
    if (!options) options = {};
    if (options.host || !options.path) {
        options.host = '127.0.0.1';
        if (!options.port) options.port = 4730;
    }
    options.socket = net.connect(options, callback);
    return new Abraxas(options,callback);
}

Abraxas.prototype.newTask = function (callback,options) {
    if (!options) options = {};
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') options.encoding = null;
    return new ClientTask(callback,options);
}

Abraxas.prototype.disconnect = function () {
    if (this.socket) this.socket.end();
    if (this.connection) this.connection.end();
    this.socket = this.connection = null;
}

Abraxas.prototype.emitError = function (error) {
    if (events.EventEmitter.listenerCount(this,'error')) return this.emit('error',error);
    throw error;
}

Abraxas.prototype.emitUnknownPacket = function (packet) {
    if (events.EventEmitter.listenerCount(this,'unknown-packet')) return this.emit('unknown-packet',error);
}

Abraxas.prototype.emitRead = function (stuff) {
    if (events.EventEmitter.listenerCount(this,'read')) return this.emit('read',stuff);
    console.error('READ',Buffer.isBuffer(stuff)?stuff:debugPacket(stuff));
}

Abraxas.prototype.emitWrite = function (stuff) {
    if (events.EventEmitter.listenerCount(this,'write')) return this.emit('write',stuff);
    console.error('WRITE',Buffer.isBuffer(stuff)?stuff:debugPacket(stuff));
}
