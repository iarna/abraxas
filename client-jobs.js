"use strict";
var packet = require('gearman-packet');
var stream = require('readable-stream');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError = require('./errors');
var ClientTask = require('./task-client');

var getStatus = exports.getStatus = function (jobid,options,onComplete) {
    if (options instanceof Function) { onComplete = options; options = null }
    if (! options) options = {};
    options.accept = {objectMode: true};
    options.nobody = true;

    var responseTimeout = options.responseTimeout != null ? options.responseTimeout : this.options.responseTimeout;
    var task = new ClientTask(onComplete);
    if (responseTimeout) task.setResponseTimeout(responseTimeout);

    task.beginPartial();
    var status = {known:0, running:0, complete:0};
    task.prepareResultWith(function(complete){ complete(status) });
    this.getConnectedServers().forEach(function(conn) {
        task.beginPartial();
        conn.socket.getStatus(jobid, function (error,data) {
            task.endPartial();
            if (error) return;
            status.known += data.args.known|0;
            status.running += data.args.running|0;
            var complete = data.args.complete|0;
            var total = data.args.total|0;
            var percent = total ? complete / total : complete;
            if (percent > status.complete) status.complete = percent;
        });
    });
    task.endPartial();
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
