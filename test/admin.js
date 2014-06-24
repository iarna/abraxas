"use strict";
var test = require('tape');
var stream = require('stream');
var types = require('gearman-packet').adminTypes;
var admin = require('../admin');

admin.newTask = require('./stub-task-client');
admin.packets = require('./stub-packets');
admin.socket  = require('./stub-socket');

function adminTest(T) {
    return function (t) {
        t.plan(6);
        var task = T.todo.apply(admin,T.args);
        var lastAccept = admin.packets.getLastAccept();
        t.is( lastAccept.length, 2 );
        var ok = lastAccept.filter(function(P){ return P.kind == 'ok' });
        var error = lastAccept.filter(function(P){ return P.kind == 'error' })
        t.is( ok.length, 1, 'awaiting an ok packet' );
        t.is( error.length, 1, 'awaiting an error packet' );
        var out = admin.socket.getLastWrite();
        t.is(out.kind, 'admin', 'Created an admin packet');
        t.is(out.type, types['line'], 'Created a line packet');
        t.is(out.args.line, T.line, 'With the correct commandline');
    };
}
test('version', adminTest({todo: admin.version, args: [], line: 'version' }));
test('shutdown', adminTest({todo: admin.shutdown, args: [], line: 'shutdown' }));
test('shutdown graceful', adminTest({todo: admin.shutdown, args: [true], line: 'shutdown graceful' }));
test('maxqueue', adminTest({todo: admin.maxqueue, args: ['foo'], line: 'maxqueue foo' }));
test('maxqueue size', adminTest({todo: admin.maxqueue, args: ['foo',23], line: 'maxqueue foo 23' }));
/*
[ { kind: 'ok', callback: [Function] },
  { kind: 'error', callback: [Function] } ] { kind: 'admin',
  type: { args: [ 'line' ], name: 'line' },
  args: { line: 'version' } }
*/