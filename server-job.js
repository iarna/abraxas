"use strict";

exports.maxJobId = 0;
var SingleClientJob = exports.SingleClientJob = require('./server-job-single');
var MultiClientJob = exports.MultiClientJob = require('./server-job-multi');
var BackgroundJob = exports.BackgroundJob = require('./server-job-background');

exports.create = function (func, background, uniqueid, priority, body) {
    var id = (uniqueid == '' || uniqueid == null)
           ? 'job:' + (++ exports.maxJobId)
           : 'unique:' + uniqueid;
    var isUnique = false;
    if (background) {
        return new BackgroundJob(id, func, uniqueid, priority, body);
    }
    else if (isUnique) {
        return new MultiClientJob(id, func, uniqueid, priority, body);
    }
    else {
        return new SingleClientJob(id, func, priority, body);
    }
}
