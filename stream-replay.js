"use strict";
var stream = require('readable-stream');
var util = require('util');

var id = 0;
var StreamReplay = module.exports = function (options) {
    if (this==null) return new StreamReplay(options);
    if (!options) options = {};
    options.decodeStrings = false;
    stream.Writable.call(this,options);
    this._buffer = [];
    this._children = [];
    this.finished = false;
    this.id = ++id;
    var self = this;
    this.once('finish',function(){
        self.emit('end');
        self.finished = true;
        self._flushChildren();
    });
}
util.inherits(StreamReplay,stream.Writable);

StreamReplay.prototype._write = function (data, enc, cb) {
    this._buffer.push([data,enc]);
    var self = this;
    this._flushChildren();
    cb();
}

StreamReplay.prototype._flushChildren = function (child) {
    var self = this;
    this._children.forEach(function (child){
        if (child.flushing) return;
        child.flushing = true;
        self._sendBufferToChild(child);
    });
}
StreamReplay.prototype._sendBufferToChild = function (child) {
    if (child.bufferLoc >= this._buffer.length) {
        if (this.finished && child.options.end) {
            child.dest.end();
        }
        return child.flushing = false;
    }
    var chunk = this._buffer[child.bufferLoc++];
    var self = this;
    child.dest.write(chunk[0],chunk[1] == 'buffer' ? null : chunk[1])
        ? this._sendBufferToChild(child)
        : child.drain = child.dest.once('drain',function() { self._sendBufferToChild(child) });
}

StreamReplay.prototype.spawn = function () {
    var out = new stream.PassThrough();
    this.pipe(out);
    var self = this;
    out.once('end',function(){ self.unpipe(out) });
    return out;
}

var childId = 0;
StreamReplay.prototype.pipe = function (pipeto,options) {
    if (!options) options = {};
    if (options.end == null) options.end = true;
    if (options.sendBuffer == null) options.sendBuffer = true;
    var child = {id:++childId, bufferLoc: options.sendBuffer ? 0: this._buffer.length, dest: pipeto, options: options};
    this._children.push(child);
    this._flushChildren();
    return pipeto;
}

StreamReplay.prototype.unpipe = function (pipeto) {
    if (pipeto == null) {
        this._children.forEach(function(child) {
            if (!child.drain) return;
            child.removeListener('drain',child.drain);
        });
        this._children = [];
        return;
    }
    var child = this._children.filter(function(pc){ return pc.dest === pipeto });
    this._children = this._children.filter(function(pc){ return pc !== child });
    if (child.drain) {
        child.removeListener('drain',child.drain);
    }
}

StreamReplay.prototype.piped = function () {
    return this._children.length ? true : false;
}
