/**
This is currently broken. It uses a previous iteration of the internal
architecture.  It's also no further then proof of concept.  Despite both of
these issues, I'm including it here for historical reasons.  When work
begins again on the server implementation this will be replaced.
**/
"use strict";
var net = require('net');
var util = require('util');
var events = require('events');
var packet = require('gearman-packet');
var through = require('through2');
var stream = require('stream');
var PacketHandler = require('./packet-handler');
var chain = require('./pipe-chain');
var debugPacket = require('./debug-packet');

var Server = exports.Server = function (options) {
    if (!options.socket) {
        throw new Error("Invalid arguments in Gearman Server constructor, must include a socket");
    }
    this.socket = options.socket;
    this.clients = {};
    this.clients.length = 0;
    var self = this;
    this.socket.on('error', function(msg) { self.emit('error', msg) });
    this.socket.on('connection',function(socket) { self.acceptConnection(socket) });
    events.EventEmitter.call(this);
}
util.inherits( Server, events.EventEmitter );

Server.prototype.listen = function (options, callback) {
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
    var id = ++ this.clients;
    var client = new ServerConnection(socket,id);
    this.clients[id] = client;
    var self = this;
    client.on('disconnect', function() {
        delete self.clients[id];
    });
}

var ServerConnection = function (socket,id) {
    events.EventEmitter.call(this);

    this.id = id;
    this.clientid = (isIPv4(socket.remoteAddress)?socket.remoteAddress:'['+socket.remoteAddress+']') + ':' + socket.remotePort;
    this.options = { exceptons: false };
    this.connection = socket;
    this.workers = {};
    this.status = 'active';

    var input_chain = [ this.connection ];
    var output_chain = [ this.connection ];
    
    var throughMethod = function (obj,method) {
        return through(function(data,enc,done){
            method.call(obj,data);
        });
    }

    if (this.options.trafficDump) {
        input_chain.push(throughMethod(this,this.emitRead));
        output_chain.push(throughMethod(this,this.emitWrite));
    }

    input_chain.push(new packet.Parser());
    output_chain.push(new packet.Emitter());

    if (this.options.packetDump) {
        input_chain.push(throughMethod(this,this.emitRead));
        output_chain.push(throughMethod(this,this.emitWrite));
    }

    this.socket = chain.output(output_chain);
    var input  = chain.input(input_chain);

    var self = this;

    input.on('data',function(data){
        if (events.EventEmitter.listenerCount(self.packets,data.type.name)) return self.packets.emit(data.type.name, data);
        self.emit('unknown-packet', data.type.name, data);
    });


    this.packets.on('OPTION_REQ', function (data) {
        if (self.options[data.args.option] != null) {
            self.options[data.args.option] = true;
            this.socket.write({kind:'response',type:packet.types['OPTION_RES'],args:{option:data.args.option}});
        }
        else {
            this.socket.write({kind:'response',type:packet.types['ERROR'],args:{errorcode: 'UNKNOWN_OPTION'},
                body: 'Option "'+data.args.option+'" is not understood by this server'
            });
        }
    }

    this.packets.on('ECHO_REQ', function (data) {
        this.socket.write({kind:'response',type:packet.types['ECHO_RES'],body:data.body});
    });

    // CAN_DO_TIMEOUT
    this.packets.on('CAN_DO', function (data) {
          self.workers[func] = {timeout:0};
        self.emit('add-worker',func,self);
    });

    this.packets.on('CANT_DO', function (data) {
        self.emit('remove-worker',func,self);
        delete self.workers[func];
    });

    this.packets.on('RESET_ABILITIES', function (data) {
        for (var func in self.workers) {
            self.emit('remove-worker',func,self);
        }
        self.workers = {};
    });

    this.packets.on('PRE_SLEEP', function (data) {
        self.status = 'sleeping';
    });

    this.packets.on('SET_CLIENT_ID', function (data) {
        self.clientid = data.args.workerid;
    });

    // SUBMIT_JOB_BG, SUBMIT_JOB_HIGH, SUBMIT_JOB_HIGH_BG, SUBMIT_JOB_LOW, SUBMIT_JOB_LOW_BG
    this.packets.on('SUBMIT_JOB', function (data) {
        // submit new work
    });

    this.packets.on('GET_STATUS', function (data) {
        self.emit('get-status', data);
    });

    // GRAB_JOB_UNIQ
    this.packets.on('GRAB_JOB', function (data) {
        self.emit('request-job', data);
        // JOB_ASSIGN or JOB_ASSIGN_UNIQ if we want else NO_JOB
    });

    // After assigning a job, should actually be jobid specific:
    this.packets.on('WORK_STATUS', function (data) {
    });
    this.packets.on('WORK_COMPLETE', function (data) {
    });
    this.packets.on('WORK_FAIL', function (data) {
    });
    this.packets.on('WORK_EXCEPTION', function (data) {
    });
    this.packets.on('WORK_DATA', function (data) {
    });
    this.packets.on('WORK_WARNING', function (data) {
    });
    
    // ALL_YOURS, SUBMIT_JOB_SCHED, SUBMIT_JOB_EPOCH
}
util.inherits( ServerConnection, events.EventEmitter );
