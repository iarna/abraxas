"use strict";
var Gearman = require('../../../index.js');
var extend = require('util-extend');
var stream = require('readable-stream');
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

var server;

var connect = function (options) {
    if (!options) options = {};
    options.debug = true;
    var socket = createFakeSocketPair();
    socket.in.remoteAddress = 'Server'; socket.in.remotePort = socket.id;
    socket.out.remoteAddress = 'Client';  socket.out.remotePort = socket.id;
    server.emit('connection',socket.in);
    options.servers = [function (cb) { process.nextTick(cb); return socket.out }];
    var gmc = new Gearman.Client(options);
    setImmediate(function(){
        socket.in.emit('connect');
        socket.out.emit('connect');
    });
    return gmc;
}

exports.Server = {
    listen: function (opts) {
        if (!opts) opts = {};
        opts.socket= server = new events.EventEmitter();
        opts.debug = true;
        return new Gearman.Server(opts);
    }
};
exports.Client = { connect: connect };
