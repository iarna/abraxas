Abraxas
-------

A gearman client, worker and server module implemented on top of gearman-protocol
for full end-to-end streaming support.

Synopsis
--------

```javascript
var Gearman = require('abraxas');
var client = Gearman.Client.connect({ host:'127.0.0.1', port:4730, defaultEncoding:'utf8' });

client.registerWorker("toUpper", function(task) {
    // Tasks can be used as promises.
    // Return values can be plain values, promises or streams.
    return task.then(function(payload) {
        return payload.toUpperCase();
    });
});

// or
var through = require('through2');
client.registerWorker("toUpper", function(task) {
    // Tasks can be used as bidirectional pipes. Read the payload from
    // the client, write the result back to the client.
    task.pipe(through(function(data,enc,done) { this.push(data.toUpperCase(),enc); done() })).pipe(task);
});

// Submitting jobs can use the traditional Node style callbacks
client.submitJob('toUpper', 'test string', function(error, result) {
    if (error) console.error(error);
    console.log("Upper:", result);
});

// or as promises
client.submitJob('toUpper', 'test string').then(function (result) {
    console.log("Upper:", result);
});

// or as streams
client.submitJob('toUpper', 'test string').pipe(process.stdout);

// or as bidirectional streams
process.stdin.pipe(client.submitJob('toUpper')).pipe(process.stdout);
```

Purpose
-------

Abraxas is aiming to be a streaming Gearman client/worker/server
implementation for Node.js.  It's built with an eye toward the ease of use
of the API for end users.  This means supporting streams and promises in an
intuitive and transparent fashion, in addition to a traditional callback
based API.

The Abraxas server implementation:

* Aims to both provide a much easier to install Gearman server. (The C++
  version requires recent versions of Boost.)
* Allow for apps using Gearman for APIs to be entirely self contained when
  an external Gearman server is not provided.
* Act as a test bed for experimental features--
  * Fully functional SUBMIT_JOB_EPOCH and SUBMIT_JOB_SCHED implementations
  * Client streaming
  * Background job queue replication to support redudency across servers


API
---

### Connecting

```javascript
var Gearman = require('abraxas');
var client = Gearman.Client.connect({ host:'127.0.0.1', port:4730, defaultEncoding:'utf8' });
```

* **var client = Gearman.Client([options][,callback])**

  **options** (optional) is an object with properties of:

  * *host* (default: 127.0.0.1)
  * *port* (default: 4730)
  * *defaultEncoding* (default: buffer) -- The stream encoding to use for client and worker payloads, unless otherwise specified.
  * *debug* -- If true, unknown or unexpected packets will be logged with
    console.error.  You can achieve the same result by listening for the
    'unknown-packet' event.
  * *trafficDump* -- If true, emits read and write events for the raw
    buffers being sent over the wire.  If no listeners for these events
    are configured the buffers will be printed with console.error.
  * *packetDump* -- If true, behaves the same as trafficDump but instead emits the parsed packets.

  **callback** (optional) will be called once the socket is established by
  `net.connect`.  There is, however, no requirement that you wait for the
  connection-- any commands issued prior to the connection being established
  will be buffered.

* **var task = client.echo([options][,data][,callback])**

  Sends **data** to the server which the server then sends back. This is
  useful as a "ping" type utility to verify that the connection is still
  live and the server responding.

  **options** (optional) is an object with properties of:

  * *encoding* (default: client.options.defaultEncoding) -- This is the
    stream encoding to use for the **data** and the response.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional; if not used you must write to the task object) is a buffer or string to get echoed back to you by the server.

  **callback** (optional; if not used, you should use task as a stream or pipe) is a *function (err, data)* that will be called
  with the result from the server. If the callback is passed in then the stream CANNOT be used as a stream or pipe.

### Tasks

Client API calls return Task objects and Workers are passed Tasks when new
work is acquired.  Tasks are duplex streams.  Tasks are also bluebird Promises.

With client Tasks, data written to the stream is sent as the payload of the
job.  When reading from a stream, the result from the worker is read.

Exceptions / failures from the worker will be emitted as errors. Warnings
from the worker are emitted as `warn` events and status updates as `status`
events.

With worker Tasks, this is reversed-- data read from the stream is the
payload, data written to the stream is the result.

Using a task as a promise will result in the promise being resolved with the
concatenated value of the stream. Exceptions and job failures will result
in the promise being rejected.

### Client

* **var task = client.submitJob(func[,options][,data][,callback])**

* **var task = client.submitJobBg(func[,options][,data][,callback])**

* **var task = client.submitJobAt(func[,options][,data][,callback])**

* **var task = client.submitJobSched(func[,options][,data][,callback])**


### Worker

* **client.registerWorker(func[,options],workercb)**

* **client.unregisterWorker(func)**

* **client.forgetAllWorkers()**

### Admin

* **var task = client.status([callback])**

* **var task = client.workers([callback])**

* **var task = client.maxqueue(func[,maxsize][,callback])**

* **var task = client.shutdown([gracefully][,callback])**

* **var task = client.version([callback])**


### Server

* TODO

