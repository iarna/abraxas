"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var extend = require('util-extend');
var ClientTask = require('./task-client');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError  = require('./errors');
var ClientConnection = require('./client-connection');
var backoff = require('backoff');

var workerConstruct = require('./worker').__construct;

var AbraxasClient = module.exports = function (options) {
    this.options = options;
    var self = this;
    this.connections = options.servers.map(function(connect){
        var C = {};
        C.socket = null;
        // Every connection is managed by a backoff object. This
        // controls how often we try to connect to the server.
        C.connect = backoff.fibonacci({
            initialDelay: 1,
            randomisationFactor: 0.15,
            maxDelay: 10000,
        })
        C.connect.on('ready', function () {
            // open the tcp connection
            var socket = connect(function() {
                var cliopts = {};
                extend(cliopts, options);
                options.socket = socket;
                // handshake with server
                var client = new ClientConnection(options,function() {
                    client.removeListener('error', C.connect.backoff);
                    // if that went well, we get to continue
                    C.connect.reset();
                    C.socket = client;
                    client.on('disconnect', function () {
                        C.socket = null;
                        C.connect.backoff();
                        self.emit('__disconnect',C);
                    });
                    client.on('error', function (error) {
                        self.emit('error',error,C);
                    });
                    self.emit('__connect',C);
                });
                client.once('error', C.connect.backoff);
                socket.removeListener('error', C.connect.backoff);
            });
            socket.once('error',C.connect.backoff);
        });
        C.connect.backoff();
        return C;
    });

    workerConstruct.call(this);
}
util.inherits( AbraxasClient, events.EventEmitter );

extend( AbraxasClient.prototype, require('./echo') );
extend( AbraxasClient.prototype, require('./client-jobs') );
//extend( AbraxasClient.prototype, require('./worker').Worker );
//extend( AbraxasClient.prototype, require('./admin') );

AbraxasClient.prototype.getConnectedServers = function () {
    return this.connections.filter(function(C){ return C.socket });
}

AbraxasClient.prototype.getConnection = function (timeout,callback) {
    if (!timeout) timeout = this.options.timeout;
    var connections = this.getConnectedServers().sort(function(A,B){ return A.lastused < B.lastused });
    if (connections.length) {
        var connection = connections[0];
        connection.lastused = new Date();
        process.nextTick(function(){ callback(null,connection.socket) });
        return;
    }
    var timer;
    if (timeout) {
        timer = setTimeout(function () { callback(new Error('Timeout while waiting for connection')) });
    }
    else {
        timer = setTimeout(function keepalive() { timer = setTimeout(keepalive,86400000) }, 86400000);
    }
    this.once('__connect',function (C){
        if (timer) clearTimeout(timer);
        C.lastused = new Date();
        callback(null, C.socket);
    });
}

AbraxasClient.connect = function(options) {
    if (!options) options = {};

    if (options.servers) {
        options.servers = options.servers.map(function(server){
            if (server instanceof Function) return server;
            var connectopts = {};
            if (typeof server == 'string') {
                var chunks = server.split(':');
                conectopts.host = chunks[0]; connectopts.port = chunks[1];
                if (!connectopts.host) options.host = '127.0.0.1';
                if (!connectopts.port) optionsport = 4730;
            }
            else {
                connectopts = server;
                if (server.host || !server.path) {
                    if (!connectopts.host) options.host = '127.0.0.1';
                    if (!connectopts.port) optionsport = 4730;
                }
            }
            return function (cb) { return net.connect(connectopts, cb) };
        });
    }
    else {
        if (options.host || !options.path) {
            if (!options.host) options.host = '127.0.0.1';
            if (!options.port) options.port = 4730;
        }
        options.servers = [function (cb) { return net.connect(options, cb) }];
    }
    return new AbraxasClient(options,callback);
}

AbraxasClient.prototype.newTask = function (callback,options) {
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    return new ClientTask(callback,options);
}
