"use strict";
var test = require('tape');
var ClientTask = require('../task-client');
var streamify = require('stream-array');
var concat = require('concat-stream');
var Promise = require('bluebird');
var stream = require('stream');

var testAcceptResultCallback = function (data,useStream) {
    return function (t) {
        t.plan(2);
        var resultError;
        var resultValue;
        var task = new ClientTask( function(err,value) {
            resultError = err;
            resultValue = value;
        }, {encoding: 'utf8'});
        task.acceptResult(useStream ? streamify([data]) : data);
        setImmediate(function() {
            t.is(resultError, null, 'No error');
            t.is(resultValue, data, 'Passed through data');
        });
    }
}
var testAcceptResultPromise = function (data,useStream) {
    return function (t) {
        t.plan(2);
        var resultError;
        var resultValue;
        var task = new ClientTask(null,{encoding: 'utf8'});
        task.acceptResult(useStream ? streamify([data]) : data);
        task.then(function (value) { resultValue = value }, function (error) { resultError = error });
        setImmediate(function() {
            t.is(resultError, void 0, 'No error');
            t.is(resultValue, data, 'Passed through data');
        });
    }
}
var testAcceptResultStream = function (data,useStream) {
    return function (t) {
        t.plan(2);
        var resultError;
        var resultValue;
        var task = new ClientTask(null,{encoding: 'utf8'});
        task.acceptResult(useStream ? streamify([data]) : data);
        task.pipe(concat(function(value) { resultValue = value }));
        task.on('error', function (err) { resultError = error });
        setImmediate(function() {
            t.is(resultError, void 0, 'No error');
            t.is(resultValue, data, 'Passed through data');
        });
    }
}

test('acceptResult callback non-stream', testAcceptResultCallback('test',false));
test('acceptResult callback stream', testAcceptResultCallback('test',true));
test('acceptResult stream non-stream', testAcceptResultStream('test',false));
test('acceptResult stream stream', testAcceptResultStream('test',true));
test('acceptResult promise non-stream', testAcceptResultPromise('test',false));
test('acceptResult promise stream', testAcceptResultPromise('test',true));

var testPrepareBody = function (options,body,assertions) {
    return function (t) {
        t.plan(assertions.length);
        var task = new ClientTask(null, options);
        var did = {};
        task.writer = {pipe: function () { did.pipe = true }}
        task.prepareBody(body,function (value) {
            if (value === task.writer) {
                did.cbWithWriter = true;
            }
            else if (value instanceof stream.Readable) {
                did.cbWithStream = true;
            }
            else {
                did.cbWithValue = true;
            }
        });
        setImmediate(function () {
            assertions.forEach(function(v) {
                t.ok( did[v], 'prepared body with '+v );
            });
        });
    }
}

test('prepareBody no body', testPrepareBody({},null,['pipe']));
test('prepareBody size and no body', testPrepareBody({bodySize: 50},null,['cbWithWriter']));
test('prepareBody promise', testPrepareBody({},Promise.fulfilled('test'),['cbWithValue']));
test('prepareBody value', testPrepareBody({},'test',['cbWithValue']));
test('prepareBody no size and stream', testPrepareBody({},streamify(['test']),['cbWithValue']));
test('prepareBody size and stream', testPrepareBody({bodySize: 4},streamify(['test']),['cbWithStream']));
var body = streamify(['test']); body.length = 4;
test('prepareBody length and stream', testPrepareBody({},body,['cbWithStream']));
