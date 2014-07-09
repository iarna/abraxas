"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var packet = require('gearman-packet');
var PacketHandler = require('./packet-handler');
var debugPacket = require('./debug-packet');
var AbraxasSocket = require('./socket');
var extend = require('util-extend');
var buffr = require('buffr');

var Server = module.exports = function (options) {
    if (!options) options = {};
    if (!options.socket) {
        throw new Error("Invalid arguments in Gearman Server constructor, must include a socket");
    }
    this.options = options;
    this.socket = options.socket;
    this.clients = {};
    this.clients.length = 0;
    this.workers = {};
    this.jobs = {};
    this.jobs.length = 0;
    var self = this;
    this.socket.on('error', function(msg) { self.emit('error', msg) });
    this.socket.on('connection',function(socket) { self.acceptConnection(socket) });
    events.EventEmitter.call(this);
}
util.inherits( Server, events.EventEmitter );

Server.listen = function (options, callback) {
    if (!options) options = {};
    var server = new net.Server();
    if (options.path) {
        server.listen(options.path, callback);
    }
    else if (options.handle) {
        server.listen(options.handle, callback);
    }
    else {
        if (!options.port) options.port = 4730;
        server.listen(options.port, options.host, options.backlog, callback);
    }
    options.socket = server;
    return new Server(options, callback);
}

Server.prototype.acceptConnection = function (socket) {
    var id = ++ this.clients.length;
    var options = {};
    extend( options, this.options );
    options.socket = socket;
    options.id     = id;
    var client = this.clients[id] = new ServerConnection(this,options);
    client.on('error',function(e) {
        console.error(e);
        client.destroy();
    });
}
Server.prototype.addWorker = function (func, client, options) {
    if (! this.workers[func]) this.workers[func] = {};
    this.workers[func][client.id] = {client: client, options: options};;
}
Server.prototype.removeWorker = function (func, client) {
    delete this.workers[func][client.id];
}
Server.prototype.recordDisconnect = function (client) {
    // TODO: disconnect from all jobs
    delete this.clients[client.id];
}
Server.prototype.getStatus = function (jobid,client) {
    var status = {};
    status.job = jobid;
    var job;
    if (job = this.jobs[jobid]) {
        status.known = 1;
        status.running  = job.worker ? 1 : 0;
        status.complete = job.complete;
        status.total    = job.total;
    }
    else {
        status.known = 0;
    }
    client.write({kind:'response',type:packet.types['STATUS_RES'],args:status});
}
Server.prototype.submitJob = function (client,func,options,body) {
    var job = new Job(client,func,options,body);
    job.jobid = ++ this.jobs.length;
    this.jobs[job.jobid] = job;
    client.write({kind:'response',type:packet.types['JOB_CREATED'],args:{job: job.jobid}});
    var self = this;
    process.nextTick(function() { self.wakeWorkers() });
}
Server.prototype.wakeWorkers = function () {
    var todo = {};
    for (var jobid in this.jobs) {
        if (jobid == 'length') continue;
        var job = this.jobs[jobid];
        if (job.worker) continue;
        todo[job.function] ++;
    }
    var clients = {};
    for (var func in todo) {
        if (!this.workers[func]) continue;
        for (var clientid in this.workers[func]) {
            if (this.clients[clientid].status != 'sleeping') continue;
            clients[clientid] ++;
        }
    }
    for (var clientid in clients) {
        this.clients[clientid].write({kind:'response',type:packet.types['NOOP']});
    }
}
Server.prototype.grabJob = function (client,unique) {
    for (var jobid in this.jobs) {
        if (jobid == 'length') continue;
        var job = this.jobs[jobid];
        if (!client.workers[job.function]) continue;
        if (job.worker) continue;
        job.worker = client;
        if (unique) {
            client.write({kind:'response',type:packet.types['JOB_ASSIGN_UNIQ'],args:{job:jobid,function:job.function,uniqueid:job.uniqueid},body:job.body});
        }
        else {
            client.write({kind:'response',type:packet.types['JOB_ASSIGN'],args:{job:jobid,function:job.function},body:job.body});
        }
        return;
    }
    client.write({kind:'response',type:packet.types['NO_JOB']});
}
Server.prototype.workComplete = function (client,jobid,body) {
    var job = this.jobs[jobid];
    // TODO: There may be multiple clients attached thanks to uniqueids
    job.client.write({kind:'response',type:packet.types['WORK_COMPLETE'],args:{job:jobid},body:body});
    delete this.jobs[jobid];
}
Server.prototype.workData = function (client,jobid,body) {
    var job = this.jobs[jobid];
    // TODO: We may have to buffer data due to uniqueids attaching late
    job.client.write({kind:'response',type:packet.types['WORK_DATA'],args:{job:jobid},body:body});
}
Server.prototype.workWarning = function (client,jobid,body) {
    var job = this.jobs[jobid];
    job.client.write({kind:'response',type:packet.types['WORK_WARNING'],args:{job:jobid},body:body});
}
Server.prototype.workException = function (client,jobid,body) {
    var job = this.jobs[jobid];
    if (job.client.features.exceptions) {
        job.client.write({kind:'response',type:packet.types['WORK_EXCEPTION'],args:{job:jobid},body:body});
    }
    else {
        job.client.write({kind:'response',type:packet.types['WORK_WARNING'],args:{job:jobid},body:body});
        job.client.write({kind:'response',type:packet.types['WORK_FAIL'],args:{job:jobid}});
    }
    delete this.jobs[jobid];
}
Server.prototype.workStatus = function (client,jobid,complete,total) {
    var job = this.jobs[jobid];
    job.complete = complete;
    job.total = total;
    job.client.write({kind:'response',type:packet.types['WORK_STATUS'],args:{job:jobid,complete:complete,total:total}});
}

var Job = function (client,func,options,body) {
    this.function = func;
    this.options = options;
    this.client = client;
    this.body = body.pipe(buffr());
    this.body.length = body.length;
    this.worker = null;
    this.complete = 0;
    this.total = 0;
}

var ServerConnection = function (server,options) {
    AbraxasSocket.call(this,options);

    this.server = server;
    this.id = options.id;
    this.features = { exceptions: false };
    this.workers = {};
    this.jobs = {};
    this.status = 'active';

    var self = this;
    this.packets.on('OPTION_REQ', function (data) {
        if (self.features[data.args.option] != null) {
            self.features[data.args.option] = true;
            self.socket.write({kind:'response',type:packet.types['OPTION_RES'],args:{option:data.args.option}});
        }
        else {
            self.socket.write({kind:'response',type:packet.types['ERROR'],args:{errorcode: 'UNKNOWN_OPTION'},
                body: 'Option "'+data.args.option+'" is not understood by this server'
            });
        }
    });

    this.packets.on('ECHO_REQ', function (data) {
        self.socket.write({kind:'response',type:packet.types['ECHO_RES'],body:data.body});
    });

    this.packets.on('CAN_DO', function (data) {
        var options  = self.workers[data.args.function] = {timeout:0};
        self.server.addWorker(data.args.function,self,options);
    });

    this.packets.on('CAN_DO_TIMEOUT', function (data) {
        var options  = self.workers[data.args.function] = {timeout:data.args.timeout};
        self.server.addWorker(data.args.function,self,options);
    });

    this.packets.on('CANT_DO', function (data) {
        self.server.removeWorker(data.args.function,self);
    });

    var reset_abilities = function () {
        for (var func in self.workers) {
            self.server.removeWorker(func,self);
        }
        self.workers = {};
    };
    this.packets.on('RESET_ABILITIES', reset_abilities);
    this.connection.on('end', function() {
        reset_abilities();
        // TODO: Abort jobs
        self.server.recordDisconnect(self);
    });

    this.packets.on('PRE_SLEEP', function (data) {
        self.status = 'sleeping';
        self.server.wakeWorkers();
    });

    this.packets.on('SET_CLIENT_ID', function (data) {
        self.clientid = data.args.workerid;
    });
    this.packets.on('SUBMIT_JOB', function (data) {
        self.server.submitJob(self,data.args.function, {uniqueid: data.args.uniqueid,priority:0}, data.body);
    });
    this.packets.on('SUBMIT_JOB_HIGH', function (data) {
        self.server.submitJob(self,data.args.function, {uniqueid: data.args.uniqueid,priority:1}, data.body);
    });
    this.packets.on('SUBMIT_JOB_LOW', function (data) {
        self.server.submitJob(self,data.args.function, {uniqueid: data.args.uniqueid,priority:-1}, data.body);
    });
    // SUBMIT_JOB_BG, SUBMIT_JOB_HIGH_BG, SUBMIT_JOB_LOW_BG
    this.packets.on('GET_STATUS', function (data) {
        self.server.getStatus(data.args.job,client);
    });
    this.packets.on('GRAB_JOB', function (data) {
        self.status='active';
        self.server.grabJob(self);
    });
    this.packets.on('GRAB_JOB_UNIQ', function (data) {
        self.status='active';
        self.server.grabJob(self,true);
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

ServerConnection.prototype.write = function (packet) {
    if (this.socket) {
        this.socket.write(packet);
    }
    else {
        console.error("Disconnected, couldn't write packet");
    }
}
