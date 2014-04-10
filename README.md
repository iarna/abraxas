Abraxas
-------

A gearman client, worker and server module implemented on top of gearman-protocol
for full end-to-end streaming support.

Remaining Work
--------------

This was published on ?/?.  Soon, I expect:

* Tests for the client/worker API layer. (The protocol layer is already fully tested.)
* Documentation
* The server library, along with a trivial gearman server implementation.
* A small wrapper to provide multi-server support.
* Expose timeouts-- on-connect, reply-to-command, complete-job.
  * Some mechanism to hook any kind of network error, the multi-server variation would want this.
* Ensure errors are exposed everywhere-- socket, parser, emitter, etc

Longer term:

* Background job durability
* Sugar library that adds some basic conventions to make Gearman easier, eg:
  * Consistent job naming, complex data types as arguments, etc.
* Gearman server clustering--
  * Share responsibility for keeping background jobs in the queue
  * Route jobs to other servers if the local server is overloaded

Examples
--------

    var Gearman = require('abraxas');

    var client = new Gearman.Client({host:'127.0.0.1',port:4730,defaultEncoding: 'utf8'});

    // Register a worker-- tasks are promises that resolve to the payload
    client.registerWorker("reverse", function(task) {
        // Returned promises are reified and used as the WORK_COMPLETE packet.
        return task.then(function(payload) {
            // If the promise results in an error, a WORK_EXCEPTION packet will be sent.
            if (!payload) throw "Can't reverse nothing";
            return payload.split("").reverse().join("");
        });
    });

    // Tasks are also streams that when read from, read the payload and
    // when written to, produce WORK_DATA packets.
    // We specify an encoding to sure we're working with buffers.
    client.registerWorker("gzip", {encoding: 'buffer'}, function(task) {
        task.pipe(zlip.createGzip()).pipe(task);
    });

    // We can submit jobs and get our answer with node style callbacks
    client.submitJob('reverse', 'test string', function(error, result) {
        if (error) console.error(error);
        console.log("Reversed:", result);
    });

    // Or promises
    client.submitJob('reverse', 'test string').then(function(result){
        console.log("Reversed:", result);
    });

    // Or as a stream
    client.submitJob('reverse', 'test string')
          .on('error', function (error) { console.error(error) })
          .pipe(process.stdout);

    // We can pass streams as the body
    client.submitJob('reverse', process.stdin).then(function(result) {
        console.log("Reversed:", result);
    });

    // We can pass no body and instead pipe into the return value of submitJob
    process.stdin.pipe(client.submitJob('reverse')).then(function(result) {
        console.log("Reversed:", result);
    })
    .catch(function(error) {
        console.log(error);
    });

    // We can pipe from one job to another
    client.submitJob('reverse','testing').pipe(client.submitJob('reverse')).pipe(process.stdout);
