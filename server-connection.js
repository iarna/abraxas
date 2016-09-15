"use strict";
var util = require('util');
var AbraxasSocket = require('./socket');
var packet = require('gearman-packet');

var ServerConnection = module.exports = function (options) {
    AbraxasSocket.call(this,options);

    this.id = options.id;
    this.feature = {
        exceptions: false,
        streaming: false
    };
    this.workers = {};
    this.jobs = {};
    this.status = 'active';

    // Requests that are handled per connection
    var self = this;
    this.packets.accept('OPTION_REQ', function (data) {
        if (self.feature[data.args.option] != null) {
            self.feature[data.args.option] = true;
            self.sendOptionResult(data.args.option);
        }
        else {
            self.sendErrorUnknownOption(data.args.option);
        }
    });

    this.packets.accept('ECHO_REQ', function (data) {
        self.socket.write({kind:'response',type:packet.types['ECHO_RES'],body:data.body});
    });

    this.packets.accept('CAN_DO', function (data) {
        self.emit('add-worker',data.args.function,self,{timeout:0});
    });

    this.packets.accept('CAN_DO_TIMEOUT', function (data) {
        self.emit('add-worker',data.args.function,self,{timeout:data.args.timeout});
    });

    this.packets.accept('CANT_DO', function (data) {
        self.emit('remove-worker',data.args.function,self);
    });

    this.packets.accept('RESET_ABILITIES', function () {
        self.emit('remove-all-workers', self);
    });

    this.packets.accept('PRE_SLEEP', function (data) {
        self.status = 'sleeping';
        self.emit('sleeping');
    });

    this.packets.accept('SET_CLIENT_ID', function (data) {
        self.clientid = data.args.workerid;
    });
    this.packets.accept('SUBMIT_JOB', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 0,
            body: data.body
        });
    });
    this.packets.accept('SUBMIT_JOB_HIGH', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 1,
            body: data.body
        });
    });
    this.packets.accept('SUBMIT_JOB_LOW', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: -1,
            body: data.body
       });
    });
    this.packets.accept('SUBMIT_JOB_BG', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            background: true,
            uniqueid: data.args.uniqueid,
            priority: 0,
            body: data.body
        });
    });
    this.packets.accept('SUBMIT_JOB_HIGH_BG', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            background: true,
            uniqueid: data.args.uniqueid,
            priority: 1,
            body: data.body
        });
    });
    this.packets.accept('SUBMIT_JOB_LOW_BG', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            background: true,
            uniqueid: data.args.uniqueid,
            priority: -1,
            body: data.body
        });
    });
    this.packets.accept('GET_STATUS', function (data) {
        self.emit('get-status',data.args.job,self);
    });
    this.packets.accept('GRAB_JOB', function (data) {
        self.status='active';
        self.emit('grab-job',self,false);
    });
    this.packets.accept('GRAB_JOB_UNIQ', function (data) {
        self.status='active';
        self.emit('grab-job',self,true);
    });
    this.packets.accept('WORK_COMPLETE', function (data) {
        self.emit('work-complete',self,data.args.job,data.body);
    });
    this.packets.accept('WORK_DATA', function (data) {
        self.emit('work-data',self,data.args.job,data.body);
    });
    this.packets.accept('WORK_STATUS', function (data) {
        self.emit('work-status',self,data.args.job,data.args.complete,data.args.total);
    });
    this.packets.accept('WORK_FAIL', function (data) {
        self.emit('work-fail',self,data.args.job);
    });
    this.packets.accept('WORK_EXCEPTION', function (data) {
        self.emit('work-exception',self,data.args.job,data.body);
    });
    this.packets.accept('WORK_WARNING', function (data) {
        self.emit('work-warning',self,data.args.job,data.body);
    });
    // ALL_YOURS, SUBMIT_JOB_SCHED, SUBMIT_JOB_EPOCH
    // plus all of admin
}
util.inherits( ServerConnection, AbraxasSocket );

ServerConnection.prototype.addWorker = function (func) {
    this.workers[func] = true;
}

ServerConnection.prototype.removeWorker = function (func) {
    delete this.workers[func];
}

ServerConnection.prototype.addJob = function (job) {
    this.jobs[job.id] = job;
}

ServerConnection.prototype.removeJob = function (job) {
    delete this.jobs[job.id];
}

ServerConnection.prototype.getJobs = function () {
    var self = this;
    return Object.keys(this.jobs).map(function(k){ return self.jobs[k] });
}

ServerConnection.prototype.write = function (packet,callback) {
    var flushed = this.socket.write(packet);
    if (!callback) return;
    if (flushed) { callback() } else { this.socket.once('drain', callback) }
}

ServerConnection.prototype.sendErrorNoSuchWorker = function (func,callback) {
    this.write({
        kind: 'response',
        type: packet.types['ERROR'],
        args: { errorcode: 'NO_SUCH_WORKER' },
        body: 'Could not remove worker '+func+', none registered'
    },callback);
}

ServerConnection.prototype.sendErrorNoSuchJob = function (jobid,callback) {
    this.write({
        kind: 'response',
        type: packet.types['ERROR'],
        args: { errorcode: 'NO_SUCH_JOB' },
        body: 'Job '+jobid+', does not exist, could not send work data to it'
    },callback);
}

ServerConnection.prototype.sendErrorNoUniqueFg = function (callback) {
    this.write({
        kind: 'response',
        type: packet.types['ERROR'],
        args: { errorcode: 'NO_SUCH_JOB' },
        body: 'Can\'t create a foreground job with a uniqueid with streaming enabled'
    },callback);
}

ServerConnection.prototype.sendOptionResult = function (option,callback) {
    this.write({
        kind: 'response',
        type: packet.types['OPTION_RES'],
        args: { option: option }
    },callback);
}

ServerConnection.prototype.sendErrorUnknownOption = function (option,callback) {
    this.write({
        kind: 'response',
        type: packet.types['ERROR'],
        args: { errorcode: 'UNKNOWN_OPTION' },
        body: 'Option "'+option+'" is not understood by this server'
    },callback);
}

ServerConnection.prototype.sendStatus = function (status,callback) {
    this.write({kind:'response',type:packet.types['STATUS_RES'],args:status},callback);
}

ServerConnection.prototype.sendJobCreated = function (jobid,callback) {
    this.write({kind:'response',type:packet.types['JOB_CREATED'],args:{job: jobid}},callback);
}

ServerConnection.prototype.sendNoop = function (callback) {
    this.write({kind:'response',type:packet.types['NOOP']},callback);
}

ServerConnection.prototype.sendJobAssignUniq = function (job,callback) {
    this.write({
        kind: 'response',
        type: packet.types['JOB_ASSIGN_UNIQ'],
        args: {
            job: job.id,
            function: job.function,
            uniqueid: job.uniqueid
        },
        body: job.getBody()
    },callback);
}

ServerConnection.prototype.sendJobAssign = function (job,callback) {
    this.write({
        kind: 'response',
        type: packet.types['JOB_ASSIGN'],
        args: {
            job: job.id,
            function: job.function,
        },
        body: job.getBody()
    },callback);
}

ServerConnection.prototype.sendNoJob = function (callback) {
    this.write({kind:'response',type:packet.types['NO_JOB']},callback);
}

ServerConnection.prototype.sendWorkComplete = function (jobid,body,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_COMPLETE'],
        args: { job: jobid },
        body: body
    },callback);
}

ServerConnection.prototype.sendWorkData = function (jobid,body,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_DATA'],
        args: { job: jobid },
        body: body
    },callback);
}

ServerConnection.prototype.sendWorkWarning = function (jobid,body,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_WARNING'],
        args: { job: jobid },
        body: body
    }, callback);
}

ServerConnection.prototype.sendWorkException = function (jobid,body,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_EXCEPTION'],
        args: { job: jobid },
        body: body
    }, callback);
}

ServerConnection.prototype.sendWorkStatus = function (jobid,complete,total,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_STATUS'],
        args: { job: jobid, complete: complete, total: total }
    },callback);
}

ServerConnection.prototype.sendWorkFail = function (jobid,callback) {
    this.write({
        kind: 'response',
        type: packet.types['WORK_FAIL'],
        args: { job: jobid }
    },callback);
}
