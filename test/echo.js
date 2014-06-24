"use strict";
var test = require('tape');
var stream = require('stream');
var types = require('gearman-packet').types;
var echolib = require('../echo');

echolib.newTask = require('./stub-task-client');
echolib.packets = require('./stub-packets');
echolib.socket  = require('./stub-socket');

function echoTest(todo) {
    return function (t) {
        t.plan(7);
        var argsOrVal = function (k) { return typeof k == 'number' ? todo.args[k] : k }
        var task = echolib.echo.apply(echolib,todo.args);
        var lastAccept = echolib.packets.getLastAccept();
        t.is(lastAccept.length, 1, 'Only waiting for one packet');
        t.is(lastAccept[0].kind, 'ECHO_RES', 'Waiting for an echo response');
        var result = {body: 'test'};
        lastAccept[0].callback(result);
        t.is(task.result,result.body, 'Accepted result body');
        t.is(task.callback, argsOrVal(todo.callback), 'Expected callback');
        var out = echolib.socket.getLastWrite();
        t.is(out.type, types['ECHO_REQ'], 'Created an echo request packet');
        t.is(out.body, argsOrVal(todo.data), 'Expected data');
        t.deepEqual(task.options, argsOrVal(todo.options), 'Expected options');
    };
}
test('no args', echoTest({args:[], options: {}, data: void 0, callback: void 0}));
test('options', echoTest({args:[{foo: 123}], options: 0, data: void 0, callback: void 0}));
test('data (string)', echoTest({args:['test'], options: {}, data: 0, callback: void 0}));
test('data (buffer)', echoTest({args:[new Buffer('test')], options: {}, data: 0, callback: void 0}));
test('data (stream)', echoTest({args:[new stream.Readable()], options: {}, data: 0, callback: void 0}));
test('callback', echoTest({args:[function () {}], options: {}, data: void 0, callback: 0}));
test('options + data (string)', echoTest({args:[{foo: 123},'test'], options: 0, data: 1, callback: void 0}));
test('options + data (buffer)', echoTest({args:[{foo: 123},new Buffer('test')], options: 0, data: 1, callback: void 0}));
test('options + data (stream)', echoTest({args:[{foo: 123}, new stream.Readable()], options: 0, data: 1, callback: void 0}));
test('options + callback', echoTest({args:[{foo: 123},function () {}], options: 0, data: void 0, callback: 1}));
test('data (string) + callback', echoTest({args:['test',function () {}], options: {}, data: 0, callback: 1}));
test('data (buffer) + callback', echoTest({args:[new Buffer('test'),function () {}], options: {}, data: 0, callback: 1}));
test('data (stream) + callback', echoTest({args:[new stream.Readable(),function () {}], options: {}, data: 0, callback: 1}));
test('options + data (string) + callback', echoTest({args:[{foo: 123},'test',function () {}], options: 0, data: 1, callback: 2}));
test('options + data (buffer) + callback', echoTest({args:[{foo: 123},new Buffer('test'),function () {}], options: 0, data: 1, callback: 2}));
test('options + data (stream) + callback', echoTest({args:[{foo: 123},new stream.Readable(),function () {}], options: 0, data: 1, callback: 2}));
