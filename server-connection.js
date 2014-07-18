"use strict";
var util = require('util');
var AbraxasSocket = require('./socket');
var packet = require('gearman-packet');

var ServerConnection = module.exports = function (server,options) {
    AbraxasSocket.call(this,options);

    this.server = server;
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
    this.packets.on('OPTION_REQ', function (data) {
        if (self.feature[data.args.option] != null) {
            self.feature[data.args.option] = true;
            self.sendOptionResult(data.args.option);
        }
        else {
            self.sendErrorUnknownOption(data.args.option);
        }
    });

    this.packets.on('ECHO_REQ', function (data) {
        self.socket.write({kind:'response',type:packet.types['ECHO_RES'],body:data.body});
    });

    this.packets.on('CAN_DO', function (data) {
        self.emit('add-worker',data.args.function,self,{timeout:0});
    });

    this.packets.on('CAN_DO_TIMEOUT', function (data) {
        self.emit('add-worker',data.args.function,self,{timeout:data.args.timeout});
    });

    this.packets.on('CANT_DO', function (data) {
        self.emit('remove-worker',data.args.function,self);
    });

    this.packets.on('RESET_ABILITIES', function () {
        self.emit('remove-all-workers', self);
    });

    this.connection.on('end', function() {
        self.emit('disconnect',self);
    });

    this.packets.on('PRE_SLEEP', function (data) {
        self.status = 'sleeping';
        self.emit('sleeping');
    });

    this.packets.on('SET_CLIENT_ID', function (data) {
        self.clientid = data.args.workerid;
    });
    this.packets.on('SUBMIT_JOB', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 0,
            body: data.body
        });
    });
    this.packets.on('SUBMIT_JOB_HIGH', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 1,
            body: data.body
        });
    });
    this.packets.on('SUBMIT_JOB_LOW', function (data) {
        self.emit('submit-job', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: -1,
            body: data.body
       });
    });
    this.packets.on('SUBMIT_JOB_BG', function (data) {
        self.emit('submit-job-bg', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 0,
            body: data.body
        });
    });
    this.packets.on('SUBMIT_JOB_HIGH_BG', function (data) {
        self.emit('submit-job-bg', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: 1,
            body: data.body
        });
    });
    this.packets.on('SUBMIT_JOB_LOW_BG', function (data) {
        self.emit('submit-job-bg', {
            client: self,
            function: data.args.function,
            uniqueid: data.args.uniqueid,
            priority: -1,
            body: data.body
        });
    });
    this.packets.on('GET_STATUS', function (data) {
        self.emit('get-status',data.args.job,client);
    });
    this.packets.on('GRAB_JOB', function (data) {
        self.status='active';
        self.emit('grab-job',self,false);
    });
    this.packets.on('GRAB_JOB_UNIQ', function (data) {
        self.status='active';
        self.emit('grab-job',self,true);
    });
    this.packets.on('WORK_COMPLETE', function (data) {
        self.server.workComplete(self,data.args.job,data.body);
    });
    this.packets.on('WORK_DATA', function (data) {
        self.server.workData(self,data.args.job,data.body);
    });
    this.packets.on('WORK_STATUS', function (data) {
        self.server.workStatus(self,data.args.job,data.args.complete,data.args.total);
    });
    this.packets.on('WORK_FAIL', function (data) {
        self.server.workFail(self,data.args.job);
    });
    this.packets.on('WORK_EXCEPTION', function (data) {
        self.server.workException(self,data.args.job,data.body);
    });
    this.packets.on('WORK_WARNING', function (data) {
        self.server.workWarning(self,data.args.job,data.body);
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
    var jobs = this.jobs;
    return Object.keys(this.jobs).map(function(k){ return jobs[k] });
}

ServerConnection.prototype.write = function (packet,callback) {
    if (this.socket) {
        var flushed = this.socket.write(packet);
        if (!callback) return;
        if (flushed) { callback() } else { this.socket.once('drain', callback) }
    }
    else {
        console.error("Disconnected, couldn't write packet", new Error().stack);
        if (callback) callback();
    }
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
        body: job.body
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
        body: job.body
    },callback);
}

ServerConnection.prototype.sendNoJob = function (callback) {
    this.write({kind:'response',type:packet.types['NO_JOB']},callback);
}

ServerConnection.prototype.sendWorkComplete = function (jobid,body,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_COMPLETE'],
        args: { job: jobid },
        body: body
    },callback);
}

ServerConnection.prototype.sendWorkData = function (jobid,body,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_DATA'],
        args: { job: jobid },
        body: body
    },callback);
}

ServerConnection.prototype.sendWorkWarning = function (jobid,body,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_WARNING'],
        args: { job: jobid },
        body: body
    }, callback);
}

ServerConnection.prototype.sendWorkException = function (jobid,body,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_EXCEPTION'],
        args: { job: jobid },
        body: body
    }, callback);
}

ServerConnection.prototype.sendWorkStatus = function (jobid,complete,total,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_STATUS'],
        args: { job: jobid, complete: complete, total: total }
    },callback);
}

ServerConnection.prototype.sendWorkFail = function (jobid,callback) {
    var flushed = this.write({
        kind: 'response',
        type: packet.types['WORK_FAIL'],
        args: { job: jobid }
    },callback);
}
