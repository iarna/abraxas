"use strict";
var packet = require('gearman-packet');

exports.echo = function (options, data, callback) {
    if (callback == null && typeof data == 'function') {
        callback = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && callback == null && typeof options == 'function') {
        callback = options;
        options = void 0;
    }
    if (!options) { options = {} }
    var self = this;
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        self.packets.acceptSerial('ECHO_RES', function (result) {
            task.acceptResult(result.body);
        });
        self.socket.write({kind:'request',type:packet.types['ECHO_REQ'],body:data});
    });
    return task;
}
