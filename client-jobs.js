"use strict";
var packet = require('gearman-packet');
var stream = require('stream');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError = require('./errors');

var getStatus = exports.getStatus = function (jobid,callback) {
    var self = this;

    var task = this.newTask(callback,{accept: {objectMode: true}, nobody: true});

    var trace = AbraxasError.trace(getStatus);

    self.packets.acceptByJobOnce('STATUS_RES', jobid, function (error,data) {
        if (error) return task.acceptError(trace.withError(error));
        var status = {};
        status.known = Number(data.args.known);
        status.running = Number(data.args.running);
        var complete = Number(data.args.complete);
        var total = Number(data.args.total);
        status.complete = total ? complete / total : complete;
        task.acceptResult(status);
    });

    self.socket.write({ kind:'request', type:packet.types['GET_STATUS'], args:{job:jobid} });

    return task;
}

var submitJob = exports.submitJob = function (func,options,data,callback) {
    if (callback == null && typeof data == 'function') {
        callback = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && callback == null && typeof options == 'function') {
        callback = options;
        options = void 0;
    }
    if (!options) { options = {} }
    var task = this.newTask(callback,options);
    var trace = AbraxasError.trace(submitJob);
    var self = this;
    var packets = this.packets;
    var socket = this.socket;
    task.prepareBody(data, function(data) {
        var type = 'SUBMIT_JOB';
        if (options.priority=='high') type += '_HIGH';
        else if (options.priority=='low') type += '_LOW';

        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(trace.withError(error));
            self.handleJobResult(task,func,trace,packets,data);
        });

        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

var submitJobBg = exports.submitJobBg = function (func,options,data,callback) {
    if (callback == null && typeof data == 'function') {
        callback = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && callback == null && typeof options == 'function') {
        callback = options;
        options = void 0;
    }
    if (!options) { options = {} }
    var packets = this.packets;
    var socket = this.socket;
    options.accept = { encoding: 'utf8' };
    var trace = AbraxasError.trace(submitJobBg);
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        var type = 'SUBMIT_JOB';
        if (options.priority=='high') type += '_HIGH';
        else if (options.priority=='low') type += '_LOW';
        type += '_BG';    
        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(trace.withError(error));
            task.acceptResult(data.args['job']);
        });

        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

var submitJobAt = exports.submitJobAt = function (func,time,options,data,callback) {
    if (callback == null && typeof data == 'function') {
        callback = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && callback == null && typeof options == 'function') {
        callback = options;
        options = void 0;
    }
    if (!options) { options = {} }
    var packets = this.packets;
    var socket = this.socket;
    options.accept = { encoding: 'utf8' };
    var trace = AbraxasError.trace(submitJobAt);
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        var type = 'SUBMIT_JOB_EPOCH';
        args.time = Math.round(Number(time instanceof Date ? time.getTime() / 1000 : time));  //
        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(trace.withError(error));
            task.acceptResult(data.args['job']);
        });

        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

var submitJobSched = exports.submitJobSched = function (func,time,options,data,callback) {
    if (callback == null && typeof data == 'function') {
        callback = data;
        data = void 0;
    }
    if (data == null && options != null && (options.pipe || options.length)) {
        data = options;
        options = {};
    }
    if (data==null && callback == null && typeof options == 'function') {
        callback = options;
        options = void 0;
    }
    if (!options) { options = {} }
    var packets = this.packets;
    var socket = this.socket;
    options.accept = { encoding: 'utf8' };
    var trace = AbraxasError.trace(submitJobSched);
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        var type = 'SUBMIT_JOB_SCHED';
        args.minute = time.minute==null?'':time.minute;
        args.hour = time.hour==null?'':time.hour;
        args.day = time.day==null?'':time.day;
        args.month = time.month==null?'':time.month;
        args.dow = time.dow==null?'':time.dow;
        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(trace.withError(error));
            task.acceptResult(data.args['job']);
        });

        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

exports.handleJobResult = function (task,func,trace,packets,data) {
    var jobid = data.args['job'];
    var out = new stream.PassThrough();
    task.emit('created');
    task.jobid = jobid;
    task.acceptResult(out);
    var cancel = function () {
        packets.removeByJob('WORK_STATUS', jobid);
        packets.removeByJob('WORK_WARNING', jobid);
        packets.removeByJob('WORK_DATA', jobid);
        packets.removeByJob('WORK_FAIL', jobid);
        packets.removeByJob('WORK_EXCEPTION', jobid);
        packets.removeByJob('WORK_COMPLETE', jobid);
    };
    packets.acceptByJob('WORK_STATUS', jobid, function (data) {
        var complete = Number(data.args.complete);
        var total = Number(data.args.total);
        var percent = complete = total ? complete / total : complete;
        task.emit('status',percent);
    });
    var lastWarning;
    packets.acceptByJob('WORK_WARNING', jobid, function (data) {
        lastWarning = null;
        streamToBuffer(data.body,function(err, body) {
            if (err) {
                cancel();
                task.acceptError(trace.withError(new AbraxasError.Receive(err.message)));
                task.end();
            }
            else {
                lastWarning = body.toString();
                task.emit('warn',lastWarning);
            }
        });
    });
    packets.acceptByJob('WORK_DATA', jobid, function (data) {
        data.body.pipe(out,{end: false });
    });
    packets.acceptByJob('WORK_FAIL', jobid, function (data) {
        cancel();
        if (lastWarning == null) {
            task.acceptError(trace.withError(new AbraxasError.JobFail(func,jobid)));
        }
        else {
            task.acceptError(trace.withError(new AbraxasError.JobException(func,jobid,lastWarning)));
        }
        task.end();
    });
    packets.acceptByJob('WORK_EXCEPTION', jobid, function (data) {
        cancel();
        streamToBuffer(data.body,function (err, body) {
            if (err) {
                task.acceptError(trace.withError(new AbraxasError.Receive(err.message)));
            }
            else {
                task.acceptError(trace.withError(new AbraxasError.JobException(func,jobid,body.toString())));
            }
            task.end();
        });
    });
    packets.acceptByJob('WORK_COMPLETE', jobid, function (data) {
        cancel();
        data.body.on('error',function (err) {
            task.acceptError(trace.withError(new AbraxasError.Receive(err)));
            task.end();
        });
        data.body.pipe(out);
    });
}
