"use strict";
var packet = require('gearman-packet');
var stream = require('readable-stream');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError = require('./errors');

// FIXME: Make this run against ALL job servers and return whichever knows about it.
var getStatus = exports.getStatus = function (jobid,options,onComplete) {
    if (options instanceof Function) {
        onComplete = options;
        options = null;
    }
    if (! options) options = {};
    options.accept = {objectMode: true};
    optiosn.nobody = true;

    var trace = AbraxasError.trace(getStatus);
    return this.startTask(onComplete,options, function (task) {
        task.conn.getStatus(jobid, function (error,data) {
            if (error) return task.acceptError(trace.withError(error));
            var status = {};
            status.known = Number(data.args.known);
            status.running = Number(data.args.running);
            var complete = Number(data.args.complete);
            var total = Number(data.args.total);
            status.complete = total ? complete / total : complete;
            task.acceptResult(status);
        });
    });
}

var submitJob = exports.submitJob = function (func,options,data,onComplete) {
    if (onComplete == null && typeof data == 'function') {
        onComplete = data;
        data = null;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && onComplete == null && typeof options == 'function') {
        onComplete = options;
        options = null;
    }
    var trace = AbraxasError.trace(submitJob);
    return this.startTask(onComplete,options,function (task) {
        task.prepareBody(data, function(data) {
            task.conn.submitJob(func,data,options,function(error,result) {
                if (error) return task.acceptError(trace.withError(error));
                task.jobid = result.args['job'];
                task.conn.handleJobResult(task,func,trace);
            });
        });
    });
}

var submitJobBg = exports.submitJobBg = function (func,options,data,onComplete) {
    if (onComplete == null && typeof data == 'function') {
        onComplete = data;
        data = null;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && onComplete == null && typeof options == 'function') {
        onComplete = options;
        options = null;
    }
    var trace = AbraxasError.trace(submitJobBg);
    return this.startTask(onComplete, options, function (task) {
        task.prepareBody(data, function(data) {
            task.conn.submitJobBg(func,data,options,function (error,result) {
                if (error) return task.acceptError(trace.withError(error));
                task.jobid = result.args['job'];
                task.acceptResult(result.args['job']);
            });
        });
    });
}

var submitJobAt = exports.submitJobAt = function (func,time,options,data,onComplete) {
    if (onComplete == null && typeof data == 'function') {
        onComplete = data;
        data = null;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && onComplete == null && typeof options == 'function') {
        onComplete = options;
        options = null;
    }
    var trace = AbraxasError.trace(submitJobAt);
    return this.startTask(onComplete, options, function(task) {
        task.prepareBody(data, function(data) {
            task.conn.submitJobEpoch(func,data,time,options,function (error,result) {
                if (error) return task.acceptError(trace.withError(error));
                task.jobid = result.args['job'];
                task.acceptResult(result.args['job']);
            });
        });
    });
}

var submitJobSched = exports.submitJobSched = function (func,time,options,data,onComplete) {
    if (onComplete == null && typeof data == 'function') {
        onComplete = data;
        data = null;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && onComplete == null && typeof options == 'function') {
        onComplete = options;
        options = null;
    }
    var trace = AbraxasError.trace(submitJobSched);
    return this.startTask(onComplete, options, function(task) {
        task.prepareBody(data, function(data) {
            task.conn.submitJobSched(func,data,time,options,function (error,result) {
                if (error) return task.acceptError(trace.withError(error));
                task.jobid = result.args['job'];
                task.acceptResult(result.args['job']);
            });
        });
    });
}
