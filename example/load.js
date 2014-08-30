"use strict";
var Gearman = require('../index');

var gmw = Gearman.Client.connect({servers: ['localhost','localhost:14730'], defaultEncoding: 'utf8', maxJobs: 30});
gmw.registerWorker('add',function (task) {
    task.then(function(nums){
        setTimeout(function(){
            var num = nums.split(/ /).map(function(N){ return N|0 });
            task.end(num[0] + num[1]);
        }, 200);
    });
});

setTimeout(function() {
    gmw.status().then(function(status){
        console.log(status);
    })
},300);

var count = 0;
['1','2','3','4','5','6','7','8','9','10'].forEach(function(O) {
    var gm = Gearman.Client.connect({connectTimeout: 100, servers: ['localhost','localhost:14730'], defaultEncoding: 'utf8'});
    ['1','2','3','4','5','6','7','8','9','10'].forEach(function(N) {
        gm.submitJob('add',N+' '+O).then(function(A){
            console.log(N+" + "+O+" =",A, "Count #",++count);
            if (N==10) { gm.disconnect() }
            if (count==100) { gmw.disconnect() }
        });
    });
});

