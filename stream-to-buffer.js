"use strict";

module.exports = function streamToBuffer(stream,callback) {
    var error = false;
    var buffer = new Buffer(0);
    stream.on('data',function(B) { buffer = Buffer.concat([buffer,B],buffer.length+B.length) });
    stream.on('error',function(E) { error = true; callback(E) });
    stream.on('end', function () { if (error) return; callback(null,buffer) });
}
