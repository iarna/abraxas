"use strict";
var Gearman = require('abraxas');
var resize = require('image-resize-stream');

var gm = Gearman.Client.connect();
gm.registerWorkerStream('image-resize',function(task) {
    task.pipe(resize(256,256)).pipe(task);
    // or
    // return task.pipe(resize(256,256));
});
