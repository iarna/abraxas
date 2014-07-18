"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var packet = require('gearman-packet');
var extend = require('util-extend');
var ClientTask = require('./task-client');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasSocket = require('./socket');

var AbraxasClient = module.exports = function (options) {
    AbraxasSocket.call(this,options);

    this.feature = {
        exceptions: false,
        streaming: false
    };

    this.packets.acceptDefault('ERROR', function (data) {
        streamToBuffer(data.body,function(err, body) {
            var error = new Error(err ? err : body.toString());
            error.name = data.args['errorcode'];
            self.emitError(error);
        });
    });

    this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'exceptions'}});
    var self = this;
    this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
        if (err) return;
        if (data.args.option == 'exceptions') {
            self.feature.exceptions = true;
        }
    });

    if (options.streaming) {
        this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'streaming'}});
        var trace = new Error();
        this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
            if (err) {
                if (err.name == 'UNKNOWN_OPTION') {
                    trace.name = err.name;
                    trace.message = 'Server does not support option "streaming"';
                    self.emitError(trace);
                }
                else {
                    self.emitError(err);
                }
                return;
            }
            if (data.args.option == 'streaming') {
                self.feature.streaming = true;
            }
        });
    }

    require('./worker').construct.call(this);
}
util.inherits( AbraxasClient, AbraxasSocket );

extend( AbraxasClient.prototype, require('./echo') );
extend( AbraxasClient.prototype, require('./admin') );
extend( AbraxasClient.prototype, require('./client-jobs') );
extend( AbraxasClient.prototype, require('./worker').Worker );

AbraxasClient.connect = function(options,callback) {
    if (!callback && typeof options == 'function') {
        callback = options; options = null;
    }
    if (!options) options = {};
    if (options.host || !options.path) {
        options.host = '127.0.0.1';
        if (!options.port) options.port = 4730;
    }
    options.socket = net.connect(options, callback);
    return new AbraxasClient(options,callback);
}

AbraxasClient.prototype.newTask = function (callback,options) {
    if (!options) options = {};
    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') delete options.encoding;
    var task = new ClientTask(callback,options);
    this.ref();
    var self = this;
    task.on('end',function(){ self.unref() });
    return task;
}
