"use strict";
var copy = require('shallow-copy');

var debugPacket = module.exports = function (data) {
    var out = copy(data);
    if (out.body) {
        if (out.body.pipe) {
            if (!out.bodySize) out['body.length'] = out.body.length;
            out.body = 'STREAM';
        }
        if (out.body.length > 64) {
            if (Buffer.isBuffer(out.body)) {
                out.body = out.body.slice(0,64);
            }
            else {
                out.body = out.body.substr(0,64);
            }
            out.bodyTruncated = true;
        }
    }
    if (out.type) {
        out.type = out.type.name;
    }
    return JSON.stringify(out);
}
