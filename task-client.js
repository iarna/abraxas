"use strict";
var stream = require('stream');
var util = require('util');
var concat = require('concat-stream');
var Task = require('./task');

var ClientTask = module.exports = function ClientTask(callback,options) {
    if (!options) options = {};
    this.options = options;
    this.callback = callback;
    var accept = new stream.PassThrough(options.accept);
    var transmit = new stream.PassThrough(options.transmit);
    Task.call(this,accept,transmit,options);
    // If we were given a callback then we aren't readable.
    if (callback) accept.end();
}
util.inherits(ClientTask, Task);

// Emits error, warn and status events

ClientTask.prototype.acceptError = function (error) {
    if (this.callback) {
        this.callback(error);
    }
    else {
        this.emit('error', error);
    }
}

ClientTask.prototype.acceptResult = function (result) {
    var callback = this.callback;
    if (callback && result.pipe) {
        result.pipe(concat(function(data){ callback(null,data) }));
        result.on('error', callback);
    }
    else if (callback) {
        callback(null,result);
    }
    else if (result == null) {
        this._reader.end();
    }
    else if (result.pipe) {
        result.pipe(this._reader);
    }
    else {
        this._reader._writableState.objectMode = true;
        this._reader._readableState.objectMode = true;
        this._reader.write(result, this.options.accept && this.options.accept.encoding ? this.options.accept.encoding : this.options.encoding );
        this._reader.end();
    }
}

ClientTask.prototype.prepareBody = function (body, callback) {
    if (body==null) {
        if (this.options.bodySize) {
            this._writer.length = this.options.bodySize;
            callback(this._writer);
        }
        else {
            this._writer.pipe(concat(function(body) { callback(body) }));
        }
    }
    else if (!body.pipe && body.then) {
        var self = this;
        body.then(function(realbody){ self.prepareBody(realbody,callback) });
        return;
    }
    else if (body instanceof stream.Readable) {
        if (this.options.bodySize) body.length = this.options.bodySize;
        if (body.length == null) {
            body.pipe(concat(function(realbody) {
                callback(realbody);
            }));
        }
        else {
            callback(body);
        }
    }
    else {
        callback(body);
    }
}
