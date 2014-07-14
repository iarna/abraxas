"use strict";
var stream = require('stream');
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
    this.on('finish',function(){
        self.finished = true;
        self._flushChildren();
    });
}
util.inherits(StreamReplay,stream.Writable);

StreamReplay.prototype._write = function (data, enc, cb) {
    var out = require('shallow-copy')(data);
    if (out.body && out.body.pipe) { out.body = 'PIPE' }
    if (Buffer.isBuffer(data)) { out = data}
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
        if (this.finished) {
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

var childId = 0;
StreamReplay.prototype.pipe = function (pipeto) {
    var child = {id:++childId, bufferLoc: 0, dest: pipeto};
    this._children.push(child);
    this._flushChildren();
    return pipeto;
}

StreamReplay.prototype.unpipe = function (pipeto) {
    var child = this._children.filter(function(pc){ return pc.dest === pipeto });
    this._children = this._children.filter(function(pc){ return pc !== child });
    if (child.drain) {
        child.removeListener('drain',child.drain);
    }
}

StreamReplay.prototype.piped = function () {
    return this._children.length ? true : false;
}
