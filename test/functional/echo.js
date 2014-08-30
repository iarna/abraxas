"use strict";
var test = require('tape');
var Gearman = require('./lib/loopback');

Gearman.Server.listen();
var gm = Gearman.Client.connect({defaultEncoding: 'utf8'});

test('echo', function (t) {
    t.plan(2);

    var message = 'test';
    gm.echo(message, function (error,result) {
        t.is(error,null,'echos should always succeed');
        t.is(result,message,'we got back what we put in');
    });
    
});
