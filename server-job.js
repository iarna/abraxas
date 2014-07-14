"use strict";
var util = require('util');
var events = require('events');
var buffr = require('buffr');
var stream = require('stream');
var StreamReplay = require('./stream-replay');
var through = require('through2');

exports.maxJobId = 0;

exports.create = function (func, uniqueid, priority, body) {
    if (uniqueid != '' && uniqueid != null) {
        return new UniqueJob("unique:"+uniqueid, func, uniqueid, priority, body);
    }
    else {
        var id = ++ exports.maxJobId;
        return new Job("job:"+id, func, priority, body);
    }
}

var Job = exports.Job = function (id, func, priority, body) {
    this.id = id;
    this.function = func;
    this.priority = priority;
    this.body = body.pipe(buffr());
    this.body.length = body.length;
    this.worker = null;
    this.complete = 0;
    this.total = 0;
    events.EventEmitter.call(this);
}
util.inherits( Job, events.EventEmitter );

Job.prototype.addClient = function(client) {
    this.client = client;
}
Job.prototype.removeClient = function(client) {
    this.client = null;
    this.emit('no-clients');
}
Job.prototype.sendWorkComplete = function(body) {
    this.client.sendWorkComplete(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkData = function(body) {
    this.client.sendWorkData(this.id,body);
}
Job.prototype.sendWorkWarning = function(body) {
    this.client.sendWorkWarning(this.id,body);
}
Job.prototype.sendWorkException = function(body) {
    this.client.sendWorkException(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkFail = function(body) {
    this.client.sendWorkFail(this.id,body);
    this.emit('job-complete');
}
Job.prototype.sendWorkStatus = function(complete,total) {
    this.complete = complete;
    this.total = total;
    this.client.WorkStatus(this.id,complete,total);
}
Job.prototype.hasWorker = function () {
    return this.worker ? true : false;
}
Job.prototype.getStatus = function () {
    return {complete: this.complete, total: this.total};
}


var UniqueJob = exports.UniqueJob = function (id, func, uniqueid, priority, body) {
    Job.call(this, id, func, priority, body);
    this.uniqueid = uniqueid;
    this.output = StreamReplay({objectMode: true});
}
util.inherits( UniqueJob, Job );

UniqueJob.prototype.addClient = function(client) {
    var jobid = this.id;
    this.output.pipe(through.obj(function(out,enc,done){
        var args = out.args ? out.args : [];
        args.unshift(jobid);
        if (out.body && out.body.pipe) {
            var body = out.body.pipe(new stream.PassThrough());
            body.length = out.body.length;
            args.push(body);
        }
        else if (out.body) {
            args.push(out.body);
        }
        args.push(done);
        client[out.method].apply(client,args);
    }));
}
UniqueJob.prototype.removeClient = function(client) {
    this.output.unpipe(client);
    if (!this.output.piped()) {
        this.emit('no-clients');
    }
}
var replayableBody = function (data) {
    var body;
    if (data instanceof stream.Readable) {
        body = data.pipe(new StreamReplay());
        body.length = data.length;
    }
    else {
        body = data;
    }
    return body;
}
UniqueJob.prototype.sendWorkData = function(data) {
    this.output.write({method:'sendWorkData',body:replayableBody(data)});
}
UniqueJob.prototype.sendWorkWarning = function(data) {
    this.output.write({method:'sendWorkWarning',body:replayableBody(data)});
}
UniqueJob.prototype.sendWorkStatus = function(complete) {
    this.complete = complete;
    this.total = total;
    this.output.write({method:'sendWorkStatus',args:[complete,total]});
}

UniqueJob.prototype.sendWorkComplete = function(data) {
    this.output.write({method:'sendWorkComplete',body:replayableBody(data)});
    this.emit('job-complete');
}
UniqueJob.prototype.sendWorkException = function(data) {
    this.output.write({method:'sendWorkException',body:replayableBody(data)});
    this.emit('job-complete');
}
UniqueJob.prototype.sendWorkFail = function() {
    this.output.write({method:'sendWorkFail'});
    this.emit('job-complete');
}
