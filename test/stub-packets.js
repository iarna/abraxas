"use strict";

var lastAccept;
exports.acceptSerial = function (kind, callback) {
    lastAccept = {'kind': kind, 'callback': callback};
}
exports.getLastAccept = function () { var last = lastAccept; lastAccept = null; return last }
