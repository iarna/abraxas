"use strict";
var net = require('net');
var util = require('util');
var backoff = require('backoff');
var events = require('events');
var ClientConnection = require('./client-connection');
var copy = require('shallow-copy');

var ClientReconnect = module.exports = function (options,newConnection) {
    this.socket = null;
    this.connect = backoff.fibonacci({
        initialDelay: 10,
        randomisationFactor: 0.15,
        maxDelay: 10000,
    });
    this.newConnection = newConnection;
    this.options = options;
    var self = this;
    this.connect.on('ready', function () { self._readyToConnect() });
    this.backoff = function () { self.connect.backoff() }
    this._readyToConnect();
    events.EventEmitter.call(this);
}
util.inherits(ClientReconnect, events.EventEmitter);


ClientReconnect.prototype.disconnect = function () {
    this.connect.reset();
    if (this.socket) {
        this.socket.removeAllListeners('disconnect');
        this.socket.removeAllListeners('error');
        this.socket.disconnect();
        this.socket = null;
        this.emit('disconnect',this);
    }
}

ClientReconnect.prototype._readyToConnect = function () {
    var self = this;
    var socket = this.newConnection(function(){ self._socketConnected(socket) });
    socket.once('error', this.backoff);
}
ClientReconnect.prototype._socketConnected = function (socket) {
    var options = copy(this.options);
    options.socket = socket;
    // handshake with server
    var self = this;
    var client = new ClientConnection(options,function() { self._connectionReady(client) });
    client.once('error', this.backoff);
    socket.removeListener('error', this.backoff);
}
ClientReconnect.prototype._connectionReady = function (client) {
    client.removeListener('error', this.backoff);
    // if that went well, we get to continue
    this.connect.reset();
    this.socket = client;
    var self = this;
    client.once('disconnect', function () {
        self.socket = null;
        self.backoff();
        self.emit('disconnect',self);
    });
    client.once('error', function (error) {
        self.emit('error',error,self);
    });
    client.setMaxListeners(0);
    self.emit('connect',self);
}
