"use strict";
var lastAccept = [];
exports.acceptSerial = function (kind, callback) {
    lastAccept.push({'kind': kind, 'callback': callback});
}
exports.getLastAccept = function () {
    var last = lastAccept;
    lastAccept = [];
    return last;
}
var lastListeners = [];
exports.on = function (event, callback) {
    lastListeners.push({kind: 'on', event: event, callback: callback});
}
exports.once = function (event, callback) {
    lastListeners.push({kind: 'once', event: event, callback: callback});
}
exports.getLastListeners = function () {
    var last = lastListeners;
    lastListeners = [];
    return last;
}