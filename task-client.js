"use strict";
var stream = require('readable-stream');
var isaStream = require('isa-stream');
var util = require('util');
var concat = require('concat-stream');
var Task = require('./task');
var AbraxasError  = require('./errors');

var ClientTask = module.exports = function ClientTask(callback,options) {
    if (!options) options = {};
    if (options.encoding == 'buffer') delete options.encoding;

    this.options = options;
    this.conn = null;
    this.completed = false;
    this.inprogress = 0;

    var accept = new stream.PassThrough(options.accept);
    var transmit = new stream.PassThrough(options.transmit);

    if (! options.encoding) options.encoding = this.options.defaultEncoding;
    if (options.encoding == 'buffer') delete options.encoding;
    if (options.encoding && (!options.accept || !options.accept.encoding)) {
        accept.setEncoding(options.encoding);
    }
    if (options.encoding && (!options.transmit || !options.transmit.encoding)) {
        transmit.setEncoding(options.encoding);
    }

    Task.call(this,accept,transmit,options);
    if (callback) {
        this.pipe(concat(function(data) { callback(null,(data instanceof Array && data.length == 1) ? data[0] : data) }));
        this.once('error', callback);
    }
    if (options.nobody) transmit.end();

    var self = this;
    this.once('end', function () { self.emit('close') });

}
util.inherits(ClientTask, Task);

ClientTask.prototype.setResponseTimeout = function (timeout) {
    var self = this;
    this.responseTimeout = setTimeout(function () {
        self.responseTimeout = null;
        self.acceptError(new AbraxasError.ResponseTimeout());
    },timeout);
}

ClientTask.prototype.setConnection = function (connection) {
    var self = this;
    this.conn = connection;
    connection.ref();
    var connectionClose = function (had_error){
        self.acceptError(new AbraxasError.Socket('connection '+(had_error?'error':'closed')));
    };
    connection.once('close', connectionClose);
    this.once('close',function(){
        connection.unref();
        connection.removeListener('close', connectionClose);
    });
}

ClientTask.prototype.end = function () {
    Task.prototype.end.call(this);
    this.emit('close');
}

ClientTask.prototype.acceptError = function (error) {
    if (this.completed) return;
    if (this.responseTimeout) clearTimeout(this.responseTimeout);
    this.completed = true;
    this.emit('error', error);
}

ClientTask.prototype.acceptResult = function (result) {
    if (this.completed) return;
    if (this.responseTimeout) clearTimeout(this.responseTimeout);
    if (result == null) {
        this.completed = true;
        this.reader.end();
    }
    else if (result.pipe) {
        result.pipe(this.reader);
        var self = this;
        result.on('error',function (err){ this.reader.emit(err) });
        result.on('end',function(){
            self.completed = true;
        });
    }
    else {
        this.completed = true;
        this.reader._writableState.objectMode = true;
        this.reader._readableState.objectMode = true;
        this.reader.write(result);
        this.reader.end();
    }
}

ClientTask.prototype.prepareBody = function (body, callback) {
    if (body==null) {
        if (this.options.bodySize) {
            this.writer.length = this.options.bodySize;
            callback(this.writer);
        }
        else {
            this.writer.pipe(concat(function(body) { callback(body) }));
        }
    }
    else if (!body.pipe && body.then) {
        var self = this;
        body.then(function(realbody){ self.prepareBody(realbody,callback) });
        return;
    }
    else if (isaStream.Readable(body)) {
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


ClientTask.prototype.prepareResultWith = function (cb) {
    this.prepareResult = cb;
}

ClientTask.prototype.beginPartial = function () {
    if (this.completed) throw new Error("Can't beginPartial a ClientTask that's completed");
    ++ this.inprogress;
    return this;
}

ClientTask.prototype.endPartial = function () {
    if (this.completed) return;
    if (!this.inprogress) throw new Error("Can't endPartial a ClientTask without begining it");
    if (! -- this.inprogress) {
        if (this.prepareResult) {
            var self = this;
            this.prepareResult(function(value){ self.acceptResult(value) });
        }
        else {
            this.acceptResult();
        }
    }
    return this;
}
