"use strict";
var packet = require('gearman-packet');
var AbraxasError = require('./errors');
var ClientTask = require('./task-client');

exports.status = function (options,onComplete) {
    if (options instanceof Function) { onComplete = options; options = null }
    if (! options) options = {};
    var responseTimeout = options.responseTimeout != null ? options.responseTimeout : this.options.responseTimeout;
    var task = new ClientTask(onComplete);
    if (responseTimeout) task.setResponseTimeout(responseTimeout);
    task.beginPartial();
    var status = {};
    task.prepareResultWith(function(complete){ complete(status) });
    this.getConnectedServers().forEach(function(conn) {
        task.beginPartial();
        conn.socket.adminTable('status', function (err,table) {
            if (err) return;
            table.forEach(function(line) {
                if (! status[line.function]) return status[line.function] = line;
                var match = status[line.function];
                match.inqueue += line.inqueue;
                match.running += line.running;
                match.workers += line.workers;
            });
            task.endPartial();
        }, function (result) {
            var jobkind = result.args.line.split(/\t/);
            return {function:jobkind[0], inqueue:jobkind[1]|0, running:jobkind[2]|0, workers:jobkind[3]|0};
        });
    });
    return task.endPartial();
}

exports.workers = function (options,onComplete) {
    if (options instanceof Function) { onComplete = options; options = null }
    if (! options) options = {};
    var responseTimeout = options.responseTimeout != null ? options.responseTimeout : this.options.responseTimeout;
    var task = new ClientTask(onComplete);
    if (responseTimeout) task.setResponseTimeout(responseTimeout);
    task.beginPartial();
    var workers = [];
    task.prepareResultWith(function(complete){ complete(workers) });
    this.getConnectedServers().forEach(function(conn) {
        task.beginPartial();
        conn.socket.adminTable('workers', function (err,table) {
            if (err) return;
            workers.push.apply(workers,table);
            task.endPartial();
        },
        function (result) {
            var matched = result.args.line.match(/^(\d+) (\S+) (\S+) :(?: (.+))?/);
            if (! matched) return;
            return {server:conn.newConnection.options,fd:matched[1], ip:matched[2], clientid:matched[3]=='-'?null:matched[3], functions:matched[4]?matched[4].split(/ /):[]};
        });
    });
    return task.endPartial();
}

exports.shutdown = function (graceful,onComplete) {
    var task = new ClientTask(onComplete);
    task.beginPartial();
    this.getConnectedServers().forEach(function(conn) {
        task.beginPartial();
        conn.socket.adminSingleResult('shutdown'+(graceful?' graceful':''), function (){ task.endPartial() });
    });
    return task.endPartial();
}

