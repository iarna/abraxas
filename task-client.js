"use strict";
var stream = require('stream');
var util = require('util');
var concat = require('concat-stream');
var Task = require('./task');

var ClientTask = module.exports = function ClientTask(callback,options) {
    if (!options) options = {};
    this.options = options;
    var accept = new stream.PassThrough(options.accept);
    var transmit = new stream.PassThrough(options.transmit);

    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') options.encoding = null;
    if (options.encoding && (!options.accept || !options.accept.encoding)) {
        accept.setEncoding(options.encoding);
    }
    if (options.encoding && (!options.transmit || !options.transmit.encoding)) {
        transmit.setEncoding(options.encoding);
    }

    Task.call(this,accept,transmit,options);
    if (callback) {
        this.pipe(concat(function(data) { callback(null,data) }));
        this.on('error', callback);
    }
    if (options.nobody) transmit.end();
}
util.inherits(ClientTask, Task);

// Emits error, warn and status events

ClientTask.prototype.acceptError = function (error) {
    this.emit('error', error);
}

ClientTask.prototype.acceptResult = function (result) {
    if (result == null) {
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
