"use strict";
var AbraxasSocket = require('./socket');
var util = require('util');
var cvar = require('./cvar');
var packet = require('gearman-packet');

var ClientConnection = module.exports = function (options,callback) {
    AbraxasSocket.call(this,options);

    this.feature = {
        exceptions: false,
        streaming: false
    };

    this.packets.acceptDefault('ERROR', function (data) {
        streamToBuffer(data.body,function(err, body) {
            if (err) {
                self.emitError(new AbraxasError.Receive());
            }
            else {
                self.emitError(new AbraxasError.Server(data.args.errorcode,body));
            }
        });
    });

    var init = cvar(callback);

    init.begin();
    this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'exceptions'}});
    var self = this;
    this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
        init.end();
        if (err) return;
        if (data.args.option == 'exceptions') {
            self.feature.exceptions = true;
        }
    });

    if (options.streaming) {
        init.begin();
        this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'streaming'}});
        var trace = AbraxasError.trace(ClientConnection);
        this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
            init.end();
            if (err) {
                if (err.code == 'UNKNOWN_OPTION') {
                    self.emitError(trace.withError(new AbraxasError.NoStreaming));
                }
                else {
                    self.emitError(trace.withError(err));
                }
                return;
            }
            if (data.args.option == 'streaming') {
                self.feature.streaming = true;
            }
        });
    }
}
util.inherits( ClientConnection, AbraxasSocket );

