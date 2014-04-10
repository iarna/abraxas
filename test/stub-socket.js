"use strict";

var lastData;
exports.write = function (data) { lastData = data }
exports.getLastWrite = function () { var last = lastData; lastData = null; return last }
