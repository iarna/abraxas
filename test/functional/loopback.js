"use strict";
var Gearman = require('../../index.js');
var extend = require('util-extend');
var stream = require('stream');
var events = require('events');
var util = require('util');
var DuplexCombination = require('duplex-combination');

var FakeSocket = function () {
    DuplexCombination.apply(this,arguments);
}
util.inherits(FakeSocket,DuplexCombination);
FakeSocket.prototype.setNoDelay = function () {}
FakeSocket.prototype.setKeepAlive = function () {}
FakeSocket.prototype.ref = function () { this._ref = setInterval(function(){},86400000) }
FakeSocket.prototype.unref = function () { clearInterval(this._ref) }

var connectId = 0;
var createFakeSocketPair = function () {
    var instream = new stream.PassThrough();
    var outstream = new stream.PassThrough();
    return {
        'id': ++connectId,
        'in': new FakeSocket(instream,outstream),
        'out': new FakeSocket(outstream,instream)
    }
}

var server = new events.EventEmitter();

var gms = new Gearman.Server({socket: server});

var connect = function (options) {
    if (!options) options = {};
    var socket = createFakeSocketPair();
    socket.in.remoteAddress = 'Server'; socket.in.remotePort = socket.id;
    socket.out.remoteAddress = 'Client';  socket.out.remotePort = socket.id;
    server.emit('connection',socket.in);
    options.servers = [function (cb) { process.nextTick(cb); return socket.out }];
    if (!options.defaultEncoding) options.defaultEncoding = 'utf8';
    var gmc = new Gearman.Client(options);
    socket.in.emit('connect');
    socket.out.emit('connect');
    return gmc;
}

exports.Server = { listen: function () { return gms } };
exports.Client = { connect: connect };
