"use strict";
var AbraxasSocket = require('./socket');
var util = require('util');
var cvar = require('./cvar');
var packet = require('gearman-packet');
var stream = require('readable-stream');
var streamToBuffer = require('./stream-to-buffer');
var AbraxasError = require('./errors');

var ClientConnection = module.exports = function (options,callback) {
    AbraxasSocket.call(this,options);

    this.feature = {
        exceptions: false,
        streaming: false
    };

    this.adminTableQueue = [];

    var self = this;
    this.packets.acceptDefault('ERROR', function (data) {
        streamToBuffer(data.body,function(err, body) {
            if (err) {
                self.emitError(new AbraxasError.Receive());
            }
            else {
                self.emitError(new AbraxasError.Server(data.args.errorcode,body));
            }
        });
    });

    var init = cvar(callback);

    init.begin();
    this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
        init.end();
        if (err) return;
        if (data.args.option == 'exceptions') {
            self.feature.exceptions = true;
        }
    });
    this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'exceptions'}});

    if (options.streaming) {
        init.begin();
        var trace = AbraxasError.trace(ClientConnection);
        this.packets.acceptSerialWithError('OPTION_RES', function (err,data) {
            init.end();
            if (err) {
                if (err.code == 'UNKNOWN_OPTION') {
                    self.emitError(trace.withError(new AbraxasError.NoStreaming));
                }
                else {
                    self.emitError(trace.withError(err));
                }
                return;
            }
            if (data.args.option == 'streaming') {
                self.feature.streaming = true;
            }
        });
        this.socket.write({kind:'request',type:packet.types['OPTION_REQ'],args:{option:'streaming'}});
    }
}
util.inherits( ClientConnection, AbraxasSocket );

ClientConnection.prototype.setClientId = function (id) {
    this.socket.write({kind:'request',type:packet.types['SET_CLIENT_ID'], args:{workerid:id}});
}

ClientConnection.prototype.handleNoJob = function (handler) {
    this.packets.accept('NO_JOB', handler);
}

ClientConnection.prototype.handleNoOp = function (handler) {
    this.packets.accept('NOOP', handler);
}

ClientConnection.prototype.wakeup = function () {
    this.sleeping = false;
}

ClientConnection.prototype.sleep = function () {
    this.sleeping = true;
    this.socket.write({kind:'request',type:packet.types['PRE_SLEEP']});
}

ClientConnection.prototype.sleeping = function () { return this.sleeping }

ClientConnection.prototype.grabJob = function () {
    this.socket.write({kind:'request',type:packet.types['GRAB_JOB_UNIQ']});
}

ClientConnection.prototype.handleJobAssign = function (handler) {
    this.connection.ref();
    this.packets.accept('JOB_ASSIGN_UNIQ', this.onJobAssign = handler);
}

ClientConnection.prototype.unhandleJobAssign = function (handler) {
    this.connection.unref();
    this.packets.removeHandler('JOB_ASSIGN_UNIQ', this.onJobAssign);
}

ClientConnection.prototype.canDo = function (func,timeout) {
    if (timeout) {
        this.socket.write({kind:'request',type:packet.types['CAN_DO_TIMEOUT'], args:{function: func, timeout: timeout}});
    }
    else {
        this.socket.write({kind:'request',type:packet.types['CAN_DO'], args:{function: func}});
    }
}

ClientConnection.prototype.resetAbilities = function () {
    this.socket.write({kind:'request',type:packet.types['RESET_ABILITIES']});
}

ClientConnection.prototype.cantDo = function (func) {
    this.socket.write({kind:'request',type:packet.types['CANT_DO'],args:{functon: func}});
}

ClientConnection.prototype.workData = function (jobid,data) {
    this.socket.write({kind:'request',type:packet.types['WORK_DATA'], args:{job:jobid}, body:data});
}

ClientConnection.prototype.workComplete = function (jobid,data) {
    this.socket.write({kind:'request',type:packet.types['WORK_COMPLETE'], args:{job:jobid}, body:data});
}

ClientConnection.prototype.workWarning = function (jobid,data) {
    this.socket.write({kind:'request',type:packet.types['WORK_WARNING'], args:{job:jobid}, body:data});
}

ClientConnection.prototype.workException = function (jobid,data) {
    if (this.feature.exceptions) {
        this.socket.write({kind:'request',type:packet.types['WORK_EXCEPTION'], args:{job:jobid}, body:data});
        this.socket.write({kind:'request',type:packet.types['WORK_FAIL'], args:{job:jobid}, body:data});
    }
    else {
        this.workWarning(jobid,data);
        this.socket.write({kind:'request',type:packet.types['WORK_FAIL'], args:{job:jobid}, body:data});
    }
}

ClientConnection.prototype.workStatus = function (jobid,percent) {
    this.socket.write({kind:'request',type:packet.types['WORK_STATUS'], args:{job:jobid, complete:percent*100, total: 100}});
}

ClientConnection.prototype.echo = function (data, handler) {
    this.packets.acceptSerial('ECHO_RES', handler);
    this.socket.write({kind:'request',type:packet.types['ECHO_REQ'],body:data});
}

ClientConnection.prototype.getStatus = function (jobid,handler) {
    this.packets.acceptByJobOnce('STATUS_RES', jobid, handler);
    this.socket.write({kind:'request',type:packet.types['GET_STATUS'],args:{job:jobid}});
}

ClientConnection.prototype.submitJob = function(func,data,options,handler) {
    var type = 'SUBMIT_JOB';
    if (options.priority=='high') type += '_HIGH';
    else if (options.priority=='low') type += '_LOW';
    this.packets.acceptSerialWithError('JOB_CREATED', handler);

    var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
    this.socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
}

ClientConnection.prototype.submitJobBg = function(func,data,options,handler) {
    var type = 'SUBMIT_JOB';
    if (options.priority=='high') type += '_HIGH';
    else if (options.priority=='low') type += '_LOW';
    type += '_BG';
    this.packets.acceptSerialWithError('JOB_CREATED', handler);

    var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
    this.socket.write({ kind:'request', type:packet.types[type], args:args, body:data });
}

ClientConnection.prototype.submitJobEpoch = function(func,data,time,options,handler) {
    this.packets.acceptSerialWithError('JOB_CREATED', handler);
    var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
    args.time = Math.round(Number(time instanceof Date ? time.getTime() / 1000 : time));  //
    this.socket.write({ kind:'request', type:packet.types['SUBMIT_JOB_EPOCH'], args:args, body:data });
}

ClientConnection.prototype.submitJobSched = function(func,data,time,options,handler) {
    this.packets.acceptSerialWithError('JOB_CREATED', handler);
    var args = {function: func, uniqueid:options.uniqueid==null?'':options.uniqueid};
    args.minute = time.minute==null?'':time.minute;
    args.hour = time.hour==null?'':time.hour;
    args.day = time.day==null?'':time.day;
    args.month = time.month==null?'':time.month;
    args.dow = time.dow==null?'':time.dow;
    this.socket.write({ kind:'request', type:packet.types['SUBMIT_JOB_SCHED'], args:args, body:data });
}

ClientConnection.prototype.handleJobResult = function (task,func,trace) {
    task.emit('created',task);
    var out = new stream.PassThrough();
    task.acceptResult(out);
    var self = this;
    var cancel = function () {
        self.packets.removeByJob('WORK_STATUS', task.jobid);
        self.packets.removeByJob('WORK_WARNING', task.jobid);
        self.packets.removeByJob('WORK_DATA', task.jobid);
        self.packets.removeByJob('WORK_FAIL', task.jobid);
        self.packets.removeByJob('WORK_EXCEPTION', task.jobid);
        self.packets.removeByJob('WORK_COMPLETE', task.jobid);
    };
    this.packets.acceptByJob('WORK_STATUS', task.jobid, function (data) {
        var complete = Number(data.args.complete);
        var total = Number(data.args.total);
        var percent = complete = total ? complete / total : complete;
        task.emit('status',percent);
    });
    var lastWarning;
    this.packets.acceptByJob('WORK_WARNING', task.jobid, function (data) {
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
    this.packets.acceptByJob('WORK_DATA', task.jobid, function (data) {
        data.body.pipe(out,{end: false });
    });
    this.packets.acceptByJob('WORK_FAIL', task.jobid, function (data) {
        cancel();
        if (lastWarning == null) {
            task.acceptError(trace.withError(new AbraxasError.JobFail(func,task.jobid)));
        }
        else {
            task.acceptError(trace.withError(new AbraxasError.JobException(func,task.jobid,lastWarning)));
        }
        task.end();
    });
    this.packets.acceptByJob('WORK_EXCEPTION', task.jobid, function (data) {
        cancel();
        streamToBuffer(data.body,function (err, body) {
            if (err) {
                task.acceptError(trace.withError(new AbraxasError.Receive(err.message)));
            }
            else {
                task.acceptError(trace.withError(new AbraxasError.JobException(func,task.jobid,body.toString())));
            }
            task.end();
        });
    });
    this.packets.acceptByJob('WORK_COMPLETE', task.jobid, function (data) {
        cancel();
        data.body.once('error',function (err) {
            task.acceptError(trace.withError(new AbraxasError.Receive(err)));
            task.end();
        });
        data.body.pipe(out);
    });
}

ClientConnection.prototype.adminSingleResult = function (command, handler) {
    this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:command}});
    this.packets.acceptSerialAdminWithError('ADMIN:ok', handler);
}

ClientConnection.prototype._handleNextQueuedTable = function () {
    if (! this.adminTableQueue.length) return;
    var args = this.adminTableQueue[0];
    var lineParser = args[0], onComplete = args[1];

    var status = [];
    var self = this;
    this.packets.accept('ADMIN:line', function (result) {
        var parsed = lineParser(result);
        if (!parsed) return;
        status.push(parsed);
    });
    this.packets.accept('ADMIN:block-complete', function (result) {
        self.packets.removeHandler('ADMIN:block-complete');
        self.packets.removeHandler('ADMIN:line');
        self.packets.removeHandler('ADMIN:error');
        onComplete(null,status);
        self.adminTableQueue.shift();
        self._handleNextQueuedTable();
    });
    this.packets.accept('ADMIN:error', function (result) {
        self.packets.removeHandler('ADMIN:error');
        self.packets.removeListener('ADMIN:line');
        self.packets.removeListener('ADMIN:block-complete');
        onComplete(result);
        self.adminTableQueue.shift();
        self._handleNextQueuedTable();
    });
}
ClientConnection.prototype.adminTable = function (command, onComplete, lineParser) {
    var self = this;
    this.adminTableQueue.push([lineParser, onComplete]);
    if (this.adminTableQueue.length==1) this._handleNextQueuedTable();
    this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:command}});
}
