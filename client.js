"use strict";
var packet = require('gearman-packet');
var stream = require('stream');
var copy = require('shallow-copy');
var streamToBuffer = require('./stream-to-buffer');

exports.getStatus = function (jobid,callback) {
    var self = this;

    var task = this.newTask(callback,{accept: {objectMode: true}});

    self.packets.acceptByJobOnce('STATUS_RES', jobid, function (data) {
        var status = copy(data.args);
        status.known = Number(status.known);
        status.running = Number(status.running);
        status.complete = Number(status.complete);
        var total = Number(status.total);
        delete status.total;
        status.complete = total ? status.complete / total : status.complete;
        task.acceptResult(status);
    });

    self.socket.write({ kind:'request', type:packet.types['GET_STATUS'], args:{job:jobid} });

    return task;
}

exports.submitJob = function (func,options,data,callback) {
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
    var trace = new Error();
    var self = this;
    var packets = this.packets;
    var socket = this.socket;
    task.prepareBody(data, function(data) {
        var type = 'SUBMIT_JOB';
        if (options.priority=='high') type += '_HIGH';
        else if (options.priority=='low') type += '_LOW';

        packets.acceptSerialWithErro('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(error);
            self.handleJobResult(task,func,trace,packets,data);
        });

        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

exports.submitJobBg = function (func,options,data,callback) {
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
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        var type = 'SUBMIT_JOB';
        if (options.priority=='high') type += '_HIGH';
        else if (options.priority=='low') type += '_LOW';
        type += '_BG';    
        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(error);
            task.acceptResult(data.args['job']);
        });

        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

exports.submitJobAt = function (func,time,options,data,callback) {
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
    var task = this.newTask(callback, options);
    task.prepareBody(data, function(data) {
        var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
        var type = 'SUBMIT_JOB_EPOCH';
        args.time = Math.round(Number(time instanceof Date ? time.getTime() / 1000 : time));  //
        packets.acceptSerialWithError('JOB_CREATED', function (error,data) {
            if (error) return task.acceptError(error);
            task.acceptResult(data.args['job']);
        });

        socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
    });
    return task;
}

exports.submitJobSched = function (func,time,options,data,callback) {
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
            if (error) return task.acceptError(error);
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
        packets.unacceptByJob('WORK_STATUS', jobid);
        packets.unacceptByJob('WORK_WARNING', jobid);
        packets.unacceptByJob('WORK_DATA', jobid);
        packets.unacceptByJob('WORK_FAIL', jobid);
        packets.unacceptByJob('WORK_EXCEPTION', jobid);
        packets.unacceptByJob('WORK_COMPLETE', jobid);
    };
    packets.acceptByJob('WORK_STATUS', jobid, function (data) {
        var status = copy(data.args);
        status.complete = Number(status.complete);
        var total = Number(status.total); delete status.total;
        status.complete = total ? status.complete / total : status.complete;
        delete status.total;
        task.emit('status',status);
    });
    var lastWarning;
    packets.acceptByJob('WORK_WARNING', jobid, function (data) {
        lastWarning = null;
        streamToBuffer(data.body,function(err, body) {
            var lastWarning = err ? err : body.toString();
            task.emit('warn',lastWarning);
            return lastWarning;
        });
    });
    packets.acceptByJob('WORK_DATA', jobid, function (data) {
        data.body.pipe(out,{end: false });
    });
    packets.acceptByJob('WORK_FAIL', jobid, function (data) {
        cancel();
        if (lastWarning == null) {
            task.emit('error', new Error('Job '+jobid+' failed'));
            task.end();
        }
        else {
            task.emit('error',new Error(lastWarning));
        }
    });
    packets.acceptByJob('WORK_EXCEPTION', jobid, function (data) {
        cancel();
        streamToBuffer(data.body,function (err, body) {
            var error = new Error(err ? err : body.toString());
            error.name = func;
            error.jobid = jobid;
            task.emit('error',error);
            task.end();
        });
    });
    packets.acceptByJob('WORK_COMPLETE', jobid, function (data) {
        cancel();
        data.body.pipe(out);
    });
}
