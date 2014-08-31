"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var extend = require('util-extend');
var ClientTask = require('./task-client');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError  = require('./errors');
var ClientReconnect = require('./client-reconnect');
var emptyFunction = require('emptyfunction');

var workerConstruct = require('./worker').__construct;

var AbraxasClient = module.exports = function (options) {
    this.options = options;
    var self = this;
    this.connections = options.servers.map(function(connect){
        var C = new ClientReconnect(self.options,connect);
        C.on('disconnect', function (C) { self.emit('disconnect',self,C)  });
        C.on('error', function (error,C) { self.emit('connection-error',error,self,C)  });
        C.on('connect', function (C) { self.emit('connect',self,C) });
        return C;
    });

    workerConstruct.call(this);
    events.EventEmitter.call(this);
}
util.inherits( AbraxasClient, events.EventEmitter );

extend( AbraxasClient.prototype, require('./echo') );
extend( AbraxasClient.prototype, require('./client-jobs') );
extend( AbraxasClient.prototype, require('./worker').Worker );
extend( AbraxasClient.prototype, require('./admin') );

AbraxasClient.connect = function(options,onConnect) {
    if (!options) options = {};

    if (options.servers) {
        options.servers = options.servers.map(function(server){
            if (server instanceof Function) return server;
            var connectopts = {};
            if (typeof server == 'string') {
                var chunks = server.split(':');
                connectopts.host = chunks[0]; connectopts.port = chunks[1];
                if (!connectopts.host) connectopts.host = '127.0.0.1';
                if (!connectopts.port) connectopts.port = 4730;
            }
            else {
                connectopts = server;
                if (! server.path) {
                    if (!connectopts.host) connectopts.host = '127.0.0.1';
                    if (!connectopts.port) connectopts.port = 4730;
                }
            }
            var connect = function (cb) { return net.connect(connectopts, cb) }
            connect.options = connectopts;
            return connect;
        });
    }
    else {
        if (options.host || !options.path) {
            if (!options.host) options.host = '127.0.0.1';
            if (!options.port) options.port = 4730;
        }
        var connect = function (cb) { return net.connect(options, cb) }
        connect.options = options;
        options.servers = [connect];
    }
    var client = new AbraxasClient(options);
    if (options.connectTimeout) {
        var timeout = setTimeout(function(){
            client.emit('error',new AbraxasError.ConnectTimeout, client);
        }, options.connectTimeout);
        client.once('connect', function () { clearTimeout(timeout) });
    }
    if (onConnect) {
        var keepalive = setInterval(emptyFunction,86400);
        var onError = function(E,client){
            clearInterval(keepalive);
            client.removeListener('connect', onSuccess);
            onConnect(E);
        }
        var onSuccess = function(client) {
            clearInterval(keepalive);
            client.removeListener('error', onError);
            onConnect(null, client);
        }
        client.once('connect', onSuccess);
        client.once('error', onError);
    }
    client.setMaxListeners(0);
    return client;
}

AbraxasClient.prototype.startTask = function (callback,options,next) {
    if (options instanceof Function) {
        next = options;
        options = null;
    }
    if (! options) options = {};
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    var submitTimeout = options.submitTimeout != null ? options.submitTimeout : this.options.submitTimeout;
    var responseTimeout = options.responseTimeout != null ? options.responseTimeout : this.options.responseTimeout;
    var task = new ClientTask(callback,options);
    if (responseTimeout) task.setResponseTimeout(responseTimeout);
    this.getConnection(submitTimeout,function(err,conn) {
        if (err) return task.acceptError(err);
        task.setConnection(conn);
        next(task);
    });
    return task;
}

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
    var keepalive;
    if (timeout) {
        timer = setTimeout(function () { callback(new AbraxasError.SubmitTimeout()) }, timeout);
    }
    else {
        keepalive = setInterval(emptyFunction, 86400);
    }

    this.once('connect',function (client,C){
        if (timer) { clearTimeout(timer) }
        if (keepalive) { clearInterval(keepalive) }
        C.lastused = new Date();
        callback(null, C.socket);
    });
}

AbraxasClient.prototype.disconnect = function () {
    this.connections.forEach(function(C) {
        C.disconnect();
    });
    this.forgetAllWorkers();
}
