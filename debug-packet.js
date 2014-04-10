"use strict";
var copy = require('shallow-copy');

var debugPacket = module.exports = function (data) {
    var out = copy(data);
    if (out.body) {
        if (out.body.pipe) {
            out.body = 'PIPE';
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
    out.type = out.type.name;
    return JSON.stringify(out);
}
