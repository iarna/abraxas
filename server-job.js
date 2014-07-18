"use strict";

exports.maxJobId = 0;
exports.SingleClientJob = require('./server-job-single');
exports MultiClientJob = require('./server-job-multi');

exports.create = function (func, uniqueid, priority, body) {
    if (uniqueid == '' || uniqueid == null) {
        var id = ++ exports.maxJobId;
        return new SingleClientJob("job:"+id, func, priority, body);
    }
    else if (
        return new MultiClientJob("unique:"+uniqueid, func, uniqueid, priority, body);
    }
}
