"use strict";
var util = require('util');
var extend = require('util-extend');
var StandardError = require('standard-error');

var AbraxasError = module.exports = function (msg,props) {
    StandardError.call(this, msg!=null && msg.toString ? msg.toString() : msg, props);
}
util.inherits(AbraxasError, StandardError);

AbraxasError.prototype.withError = function (error) {
    extend(this,error);
    return this;
}

AbraxasError.trace = function (constructor) {
    var error = new AbraxasError();
    Error.captureStackTrace(error,constructor);
    return error;
}

var Receive = AbraxasError.Receive = function (message) {
    AbraxasError.call(this,'While reading packet body: '+message);
}
util.inherits(Receive, AbraxasError);
Receive.prototype.name = 'ReceiveError';

var Server = AbraxasError.Server = function (code,message,err) {
    AbraxasError.call(this,message, {code: code});
}
util.inherits(Server, AbraxasError);
Server.prototype.name = 'ServerError';

var NoStreaming = AbraxasError.NoStreaming = function () {
    AbraxasError.call(this,'Server does not support option "streaming"');
}
util.inherits(NoStreaming, AbraxasError);
NoStreaming.prototype.name = 'NoStreaming';

var Connect = AbraxasError.Connect = function (msg) {
    AbraxasError.call(this,msg);
}
util.inherits(Connect, AbraxasError);
Connect.prototype.name = 'ConnectError';

var Socket = AbraxasError.Socket = function (msg) {
    AbraxasError.call(this,msg);
}
util.inherits(Socket, AbraxasError);
Socket.prototype.name = 'SocketError';

var Parser = AbraxasError.Parser = function (msg) {
    AbraxasError.call(this,msg);
}
util.inherits(Parser, AbraxasError);
Parser.prototype.name = 'ParserError';

var Emitter = AbraxasError.Emitter = function (msg) {
    AbraxasError.call(this,msg);
}
util.inherits(Emitter, AbraxasError);
Emitter.prototype.name = 'EmitterError';

var JobFail = AbraxasError.JobFail = function (name,jobid) {
    AbraxasError.call(this,'Job '+jobid+' failed',{function: name, jobid: jobid});
}
util.inherits(JobFail, AbraxasError);
JobFail.prototype.name = 'JobFail';

var JobException = AbraxasError.JobException = function (name,jobid,payload) {
    AbraxasError.call(this,payload,{function: name, jobid: jobid});
}
util.inherits(JobException, JobFail);
JobException.prototype.name = 'JobException';

var ConnectTimeoutException = AbraxasError.ConnectTimeout = function () {
    AbraxasError.call(this,'Timeout while waiting for connection');
}
util.inherits(ConnectTimeoutException, AbraxasError);
ConnectTimeoutException.prototype.name = 'ConnectTimeout';

var SubmitTimeoutException = AbraxasError.SubmitTimeout = function () {
    AbraxasError.call(this,'Timeout while waiting for connection');
}
util.inherits(SubmitTimeoutException, AbraxasError);
SubmitTimeoutException.prototype.name = 'SubmitTimeout';

var ResponseTimeoutException = AbraxasError.ResponseTimeout = function () {
    AbraxasError.call(this,'Timeout while waiting for response');
}
util.inherits(ResponseTimeoutException, AbraxasError);
ResponseTimeoutException.prototype.name = 'ResponseTimeout';
