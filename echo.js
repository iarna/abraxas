"use strict";
var packet = require('gearman-packet');

exports.echo = function (options, data, onComplete) {
    if (onComplete == null && typeof data == 'function') {
        onComplete = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && onComplete == null && typeof options == 'function') {
        onComplete = options;
        options = void 0;
    }
    return this.startTask(onComplete, options, function (task) {
        task.prepareBody(data, function(body) {
            task.conn.echo(body, function (result) {
                task.acceptResult(result.body);
            });
        });
    });
}
