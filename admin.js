"use strict";
var packet = require('gearman-packet');

var getTableQueue = [];
var callNextQueued = function() {
    getTableQueue.shift(); // remove ourselves
    if (! getTableQueue.length) return;
    getTableQueue[0](); // call next
}

var handleGetTable = function (gearman,callback,linehandler,task) {
    var status = [];
    var lineHandler;
    gearman.packets.on('line', lineHandler = function (result) {
        status.push(linehandler(result));
    });
    var completeHandler;
    gearman.packets.once('block-complete', completeHandler = function (result) {
        gearman.packets.removeListener('line',lineHandler);
        gearman.packets.removeListener('error',errorHandler);
        task.acceptResult(status);
        callNextQueued();
    });
    var errorHandler;
    gearman.packets.once('error', errorHandler = function (result) {
        gearman.packets.removeListener('line',lineHandler);
        gearman.packets.removeListener('block-complete',completeHandler);
        var error = new Error(result.message);
        error.name = result.code;
        task.acceptError(error);
        callNextQueued();
    });
}

var getTable = function (gearman,callback,linehandler) {
    var task = gearman.newTask(callback);
    getTableQueue.push(function(){ handleGetTable(gearman,callback,linehandler,task) });
    if (getTableQueue.length==1) getTableQueue[0]();
    return task;
}

exports.status = function (callback) {
    this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:'status'}});
    return getTable(this,callback,function(result) {
        var jobkind = result.args.line.split(/\t/);
        return {function:jobkind[0], inqueue:jobkind[1], running:jobkind[2], workers:jobkind[3]};
    });
}

exports.workers = function (callback) {
    this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:'workers'}});
    return getTable(this,callback,function(result) {
        var matched = result.args.line.match(/^(\d+) (\S+) (\S+) :(?: (.+))?/);
        if (matched) {
            return {fd:matched[1], ip:matched[2], clientid:matched[3]=='-'?null:matched[3], functions:matched[4]?matched[4].split(/ /):[]};
        }
        else {
            return {error:result.args.line};
        }
    });
}

var acceptSerialWithError = function (packets, event, callback) {
    var success = function (data) {
        packets.unacceptSerial('error', failure);
        callback(null, data);
    }
    var failure = function (data) {
        packets.unacceptSerial(event, success);
        streamToBuffer(data.body,function(err,body) {
            var error = new Error(err ? err : body.toString());
            error.name = data.args['errorcode'];
            callback(error);
        });
    }
    packets.acceptSerial(event, success);
    packets.acceptSerial('error', failure);
}


var taskError = function (task,valuehandler) {
    return function (err,value) {
       if (err) {
           var error = new Error(err.message);
           error.name = err.code;
           task.acceptError(error);
       }
       else {
           task.acceptResult(valuehandler ? valuehandler(value) : null);
       }
    }
}

exports.maxqueue = function (func,maxsize,callback) {
   var task = this.newTask(callback);
   this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:'maxqueue '+func+(maxsize?' '+maxsize:'')}});
   acceptSerialWithError(this.packets, 'ok', taskError(task));
   return task;
}

exports.shutdown = function (graceful,callback) {
   var task = this.newTask(callback);
   this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:'shutdown'+(graceful?' graceful':'')}});
   acceptSerialWithError(this.packets, 'ok', taskError(task));
   return task;
}

exports.version = function (callback) {
   var task = this.newTask(callback);
   this.socket.write({kind:'admin',type:packet.adminTypes['line'],args:{line:'version'}});
   acceptSerialWithError(this.packets, 'ok', taskError(task, function (V){ return V.args.line }));
   return task;
}
