"use strict";
var util = require('util');
var events = require('events');
var stream = require('stream');
var StreamReplay = require('./stream-replay');
var through = require('through2');

var Job = require('./server-job-single');

var UniqueJob = module.exports = function (id, func, uniqueid, priority, body) {
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
    },{ sendBuffer: client.feature.streaming }));
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
