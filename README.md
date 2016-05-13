Abraxas
-------

[![Join the chat at https://gitter.im/iarna/abraxas](https://badges.gitter.im/iarna/abraxas.svg)](https://gitter.im/iarna/abraxas?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

A gearman client, worker and server module implemented on top of gearman-protocol
for full end-to-end streaming support.

Synopsis
--------

```javascript
var Gearman = require('abraxas');
var client = Gearman.Client.connect({ servers: ['127.0.0.1:4730'], defaultEncoding:'utf8' });

client.registerWorker("toUpper", function(task) {
    return task.payload.toUpperCase();
});

// or

client.registerWorker("toUpper", function(task) {
    task.end(task.payload.toUpperCase());
});

// or
var through = require('through2');
client.registerWorkerStream("toUpper", function(task) {
    // Streaming workers task's can be used as bidirectional pipes. Read the
    // payload from the client, write the result back to the client.
    task.pipe(through(function(data,enc,done) { this.push(data.toUpperCase(),enc); done() })).pipe(task);
});

// When submitting jobs you can use traditional Node style callbacks
client.submitJob('toUpper', 'test string', function(error, result) {
    if (error) console.error(error);
    console.log("Upper:", result);
});

// or promises
client.submitJob('toUpper', 'test string').then(function (result) {
    console.log("Upper:", result);
});

// or streams
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
var client = Gearman.Client.connect({ servers:[{host:'127.0.0.1', port:4730}], defaultEncoding:'utf8' });
var client = Gearman.Client.connect({ servers:['127.0.0.1:4730'], defaultEncoding:'utf8' });
```

* **var client = Gearman.Client([options][,callback])**

  **options** (optional) is an object with properties of:

  * Connection options:

    * *host* (default: 127.0.0.1)
    * *port* (default: 4730)

    OR

    * *servers* -- An array of gearman servers to connect to. These can either
      be objects with host and port (and any of the other options below, to set
      them per-server), or a string of 'host:port'.

  * *streaming* (default: false) -- Requests the Abraxas server's streaming
    mode. Makes workers streaming data back over WORK_DATA safe. If you
    request this with the C++ gearmand you'll get a connection error.
  * *defaultEncoding* (default: buffer) -- The stream encoding to use for
    client and worker payloads, unless otherwise specified.
  * *maxJobs* (default: 1) -- The maximum number of simultaneous jobs
    that workers on this connection will execute. This is the concurrency tuning
    paramter for registerWorker. This has no effect on the number of jobs handled
    via submitJob.
  * *submitTimeout* (default: ∞) Default time to wait for a gearman server
    to become available when submitting a job. Jobs who fail with this
    timeout are guaranteed to not have been submitted to any servers or workers.
  * *responseTimeout* (default: ∞) Default time to wait for a job to complete.
  * *debug* -- If true, unknown or unexpected packets will be logged with
    console.error.  You can achieve the same result by listening for the
    'unknown-packet' event.
  * *trafficDump* -- If true, emits read and write events for the raw
    buffers being sent over the wire.  If no listeners for these events
    are configured the buffers will be printed with console.error.
  * *packetDump* -- If true, behaves the same as trafficDump but instead emits
    the parsed packets.

  **callback** (optional) will be called once a connection is established to
  any of the servers. There is, however, no requirement that you wait for the
  connection-- any commands issued prior to the connection being established
  will be buffered.

* **Reconnection and Multiple Servers**

Abraxas will begin attempting to connect to the servers its started with
immediately.  If a connection drops, it will attempt to reconnect
automatically.  Connections back off following the fibonacci sequence with a
maximum delay of 10 seconds between retries and a randomization factor of
15%.

Details on how each command handles multiple server connections is detailed
in the command's documentation.  Generally however, worker related commands
go to ALL available servers and all future servers.  As such, worker related
commands return immediately.  By contrast, client related commands go to ANY
ONE server and if no server is available they'll wait for a connection to be
established.

* **Streaming Mode**

  The Abraxas server supports "streaming" mode which modifies the semantics to
  support streaming clients.  (See the included [SEMANTICS](SEMANTICS.md)
  document.)

  Specifically, when the worker is in streaming mode:
  
  * If it disconnects in the middle of a job, the server will send a
    WORK_FAIL response instead of requeing the job.

  * Writes are not buffered and are immediately sent with WORK_DATA packets.
    (Ordinarily writes are buffered and only sent when the worker ends with
    a WORK_COMPLETE packet.)

  When the client is in streaming mode:

  * Submitting uniqueid foreground jobs is an error and your job will
    immediately fail without being submitted.

* **client.on('connect', function(client) { ... })**

  Called after a connection is established. NOTE: This can and will be
  called more than once.

* **client.on('disconnect', function(client) { ... })**

  Called after the connection drops for any reason.

* **client.on('connection-error', function(error,client) { ... })**

  Called any time there's an error in one of the connections. This is not
  fatal and connections will be automatically reestablished.

* **client.disconnect()**

  Disconnects the client after flushing the current buffer.

* **var task = client.echo([options][,data][,callback])**

  Sends **data** to the server which the server then sends back. This is
  useful as a "ping" type utility to verify that the connection is still
  live and the server responding.

  **options** (optional) is an object with properties of:

  * *encoding* (default: client.options.defaultEncoding) -- This is the
    stream encoding to use for the **data** and the response.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional) is a buffer or string to get echoed back to you by the
  server.  If data is passed in then the task cannot be written to.

  **callback** (optional) is a *function (err, data)* that will be called
  with the result from the server.  If the callback is passed in then the
  task cannot be read from.

* **var task = client.getStatus(jobid[,callback])**

  Fetches the status of a running job. This task is read only-- if you read
  from it as a stream, it will emit the status object.  This runs against
  all connected servers.

  **callback** (optional) is a *function (err, status)* that will be called
  with the result from the server; see details on the **status** object
  below.  If the callback is passed in then the task cannot be read from.

  The **status** object has the following properties:

  * *known* Number of servers that know about the job, typically 1 or 0.
  * *running* Number of servers that are running the job, typically 1 or 0.
  * *complete* Percent job completion, if the job has been updating its status.

* **client.setClientId(id)**

  Sets the id for this connection to the arbitrary string you provide. This
  is returned by the workers command.

### Tasks

Client API calls return Task objects and Workers are passed Tasks when new
work is acquired.  Tasks are duplex streams.  Tasks also proxy to bluebird
Promises.

With client Tasks, data written to the stream is sent as the payload of the
job.  When reading from a stream, the result from the worker is read.

With worker Tasks, this is reversed-- data read from the stream is the
payload, data written to the stream is the result.

Tasks have a `jobid` property. On client Tasks this won't be set until the
`created` event is emitted.

When a task is the result of submitting a job, it will emit a `created`
event when we've been notified that the server has accepted the job.

Exceptions / failures from the worker will be emitted as `error` events.

Warnings from the worker will be emitted as `warn` events with a single
string argument containing the warning.

Status updates from the worker will be emitted as `status` events with
percentage completion as the argument.

Using a task as a promise will result in the promise being resolved with the
concatenated value of the stream. Exceptions and job failures will result
in the promise being rejected.


### Client

* **var task = client.submitJob(func[,options][,data][,callback])**

  Submit a job to the gearman server-- write to the `task` to send your
  payload.  As described above, the task can be read from as a stream to
  retreive your result, or you can use it as a promise with `.then` to get
  its value.  Tasks can also emit `error`, `warn` and `status` events, see
  the tasks section for details.

  Jobs are submitted to only one server. The server to use is selected on a
  round-robin basis amongst active connections.

  **func** The name of the function you want to call.

  **options** (optional) is an object with properties of:

  * *priority* (default: null; normal priority) -- Can be `high` or `low`,
    these effect the priority of this item in the job queue when there's a backlog.
    (Note: Exact semantics are determined by the gearman server, so you'll need
    to check its documentation.)
  * *encoding* (default: client.options.defaultEncoding) -- The
    stream encoding to use for the response stream.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional) is the payload to be submitted to the **func** worker. 
  If it is passed in the task cannot be written to.

  **callback** (optional) is a *function (err, data)* that will be called
  with the result from the worker.
  
* **var task = client.submitJobBg(func[,options][,data][,callback])**

  Submit a background job to the gearman server.  This is a job where you
  don't care about the result.  You can disconnect from the server and the
  job will still be executed.  The result of the task is the `jobid` the
  task was created with.

  Jobs are submitted to only one server. The server to use is selected on a
  round-robin basis amongst active connections.

  **func** The name of the function you want to call.

  **options** (optional) is an object with properties of:

  * *priority* (default: null; normal priority) -- Can be `high` or `low`,
    these effect the priority of this item in the job queue when there's a backlog.
    (Note: Exact semantics are determined by the gearman server, so you'll need
    to check its documentation.)
  * *encoding* (default: client.options.defaultEncoding) -- The
    stream encoding to use for the response stream.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional) is the payload to be submitted to the **func** worker. 
  If it is passed in the task cannot be written to.

  **callback** (optional) is a *function (err, jobid)* that will be called
  with the jobid.

* **var task = client.submitJobAt(func,date[,options][,data][,callback])**

  EXPERIMENTAL. Submit a background job to happen at a specific time.

  Jobs are submitted to only one server. The server to use is selected on a
  round-robin basis amongst active connections.

  **func** The name of the function you want to call.

  **date** Either a `Date` object or a unix epoch time (seconds since 1970).

  **options** (optional) is an object with properties of:

  * *encoding* (default: client.options.defaultEncoding) -- The
    stream encoding to use for the response stream.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional) is the payload to be submitted to the **func** worker. 
  If it is passed in the task cannot be written to.

  **callback** (optional) is a *function (err, jobid)* that will be called
  with the jobid.

* **var task = client.submitJobSched(func,schedule[,options][,data][,callback])**

  ***WARNING: Not implemented in any existing gearman server, but in the protocol documentation.***

  Submit a background job to happen on a schedule

  Jobs are submitted to only one server. The server to use is selected on a
  round-robin basis amongst active connections.

  **func** The name of the function you want to call.

  **schedule** is an object with properties of:

  * *minute*
  * *hour*
  * *day*
  * *month*
  * *dow*

  **options** (optional) is an object with properties of:

  * *encoding* (default: client.options.defaultEncoding) -- The
    stream encoding to use for the response stream.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **data** (optional) is the payload to be submitted to the **func** worker. 
  If it is passed in the task cannot be written to.

  **callback** (optional) is a *function (err, jobid)* that will be called
  with the jobid.

### Worker

* var worker = **client.registerWorkerStream(func[,options],workercb)**
* var worker = **client.registerWorker(func[,options],workercb)**

  Register a handler for **func**.  **workercb** is passed a task when a
  client submits a job.

  
  With `registerWorker`, the task will have a **payload** property. With
  `registerWorkerStream` the task a stream that can be read from in the
  usual ways to get the payload. See the section on Tasks for details.

  Writing to the task will send that as the response to the client. What's
  written will be buffered and sent as a WORK_COMPLETE packet, unless you
  connected with the streaming option, in which case WORK_DATA packets
  will be sent as data is written.

  Functions will be registered on ALL servers. Any servers connected or
  reconnected to later will have functions reregistered with them.

  If you emit an error event this will result in a WORK_EXCEPTION packet if
  supported by the server, otherwise it will emit a WORK_WARNING followed by
  a WORK_FAIL.

  If you throw an exception, it will result in a WORK_EXCEPTION packet.

  If you return a value, the job will be completed with that value. If you
  return a stream, that stream will be piped to the client as the result.

  If you return a promise, that promise will be resolved and its resolved
  value will be treated as above.

  If you don't return anything then you're expected to have written to the
  task yourself.

  **func** The name of the function that we'll handle.

  **options** (optional) is an object with properties of:

  * *timeout* (default: none) If included, instructs the server that if more
    then *timeout* seconds pass without the work completing then it should
    give up and resubmit the work for processing by a different worker.
  * *encoding* (default: client.options.defaultEncoding) -- The stream
    encoding to use for the response stream.
  * *accept* -- This is the options to pass to the response stream constructor.
  * *transmit* -- This is the options to pass to the payload stream constructor.

  **workercb** is a `function (task)` that's called when there's new work to do. The task
  object has following additional methods:

  * *task.status(percent)* A float that represents how much work has been
     completed so far (as a decimal, eg, .25 = 25%).
  * *task.warn(msg)* Where `msg` is a buffer, string or a stream. This
    warning will be sent to the client.  (Clients interpret `msg` as
    strings.)
  * *task.end(data)* Completes the task, sending a WORK_COMPLETE packet with
    `data`.  `data` can be a buffer, string or stream.
  * *task.error(data)* Fails the task, sending a WORK_FAIL packet with
    `data`.  `data` can be a buffer, string or stream. Also sends either a
    WORK_EXCEPTION or WORK_WARNING with he same data before WORK_FAIL
    depending on wether the server supports the exception extension.

  The worker object returned has the property:

  * *function* (value) The name of the funciton this worker object is tied to.

  And methods:

  * *var task = worker.unregister()* Short cut for `client.unregisterWorker(worker.function)`
  * *var task = worker.maxqueue([maxsize][,callback])* Short cut for `client.maxqueue(worker.function,maxsize,callback)`
  * *var task = worker.status()* Resolves with a status object with the properties:

    * *inqueue* The number of jobs in queue for this function.
    * *running* How many of those jobs are currently running.
    * *workers* How many workers are available to run jobs. (Sometimes low,
      due to workers being able to handle multiple jobs simultaneously.)

* **var task = client.maxqueue(func[,maxsize][,callback])**

  Sets the maximum number of jobs that may be queued at one time for a
  specific function. Like other worker functions, this is sent to all
  server connections, current and future.

  **func** is the function to set or clear this limit of.
  **maxsize** (default: unlimited) is the maximum number of jobs to be queued at a time for this funciton.
  **callback** (optional) is a `function (err)`

* **client.unregisterWorker(func)**

  Notifies all servers that we are no longer handling requests for the **func** job.

  **func** The name of the function unregister.

* **client.forgetAllWorkers()**

  Tells all the server that we are no longer handling any functions at all.

### Admin

* **var task = client.status([callback])**

  Fetches the current status of all functions that all connected gearman
  servers are aware of. If no gearman servers are connected then it will
  immediately return an empty object. It is resolved with a *functionstatus* object.

  **callback** (optional) is a `function (functionstatus)`.

  The *functionstatus* object is keyed on *function* name and has values
  that are objects with the properties:
  
  * *function* - The name of a function.
  * *inqueue* The number of jobs in queue for this function.
  * *running* How many of those jobs are currently running.
  * *workers* How many worker connections are available to run jobs.
    (Sometimes lower than running, due to workers being able to handle
    multiple jobs per connection.)

* **var task = client.workers([callback])**

  Fetches a list of all connections and what workers, if any, they have
  registered.  It is resolved with a *workerlist* array.

  **callback** (optional) is a `function (workerlist)`.

  The *workerlist* array is made up of objects with the properties:

  * *server* An object with either host and port properties or a path
    property describing how we connected to the server this worker is
    associated with.
  * *fd* The file descriptor of this connection on the server.
  * *ip* The ip address that the connection came from.
  * *clientid* The client id of the connection, if any. Defaults to null.
  * *functions* An array of all of the function names.

* **var task = client.shutdown([gracefully][,callback])**

  Requests that all connected servers shutdown. If you wanted to shutdown a
  bunch of gearman servers you might do this:

```javascript
['server1:port','server2:port','server3:port'].forEach(function(server){
    Gearman.Client.connect({servers:[server]},function(err,client) {
        client.shutdown(true,function(err){
            if (err) console.error(err);
            client.disconnect();
        });
    });
});
```

  **gracefully** (default: false) If true, stops listening for new connections but waits for running jobs to complete before shutting down.
  **callback** (optional) is a `function (err)`

* **var task = client.getpid([callback])**

TO BE IMPLEMENTED

* **var task = client.createfunction(func,[callback])**

TO BE IMPLEMENTED

* **var task = client.dropfunction(func,[callback])**

TO BE IMPLEMENTED

* **var task = client.canceljob(jobid)**

TO BE IMPLEMENTED

* **var task = client.getjobs()**

TO BE IMPLEMENTED

* **var task = client.getuniquejobs()**

TO BE IMPLEMENTED

### Server

```javascript
var Gearman = require('abraxas');
Gearman.Server.listen({port: 4730});
```

WARNING

The server is known to have memory leaks.

TO BE DOCUMENTED

But really, that above is about all there is to it right now. It takes the same
types of debugging options as the client, eg, trafficDump, packetDump. It should
work, but see [TODO.md](TODO.md).

### Glossary

* **server** - A Gearman server instance. This is responsible for queueing
  jobs from **client**s, dispatching them to **worker**s and sending results
  back to **client**s.
* **function** - A kind of work that the Gearman is aware of that workers
  may do.  It can become aware of a new **function** in three ways, first, a
  **worker** could register to handle one, second a **client** could request
  one be run or third via the createfunction admin command.
* **payload** - Functions only receive one argument, the payload, and this is
  it. The protocol leaves it an unspecified blob, it's up to you to impose
  more structure.  With this library, setting an encoding will get you
  strings.
* **job** - Jobs are the record in the **server** that work needs to be done.
* **task** - Tasks the client and worker side representation of work to be
  completed. They hold job information and provide stream and promise
  interfaces.

It's worth noting that all other gearman libraries I'm aware of run client
and worker commands through their own classes and via their own connections. 
There's no technical reason for this, and this library does not make that
distinction-- you can submit jobs and register workers from the same
connection and so one program cn be both client and worker.

* **client** - Any program that connects to the gearman server and submits jobs. 
* **worker** - Any program that connects to the gearman server and registers workers.

### What's not here

The various undocumented extensions to the protocol that the C++ gearmand
(from gearman.org) has introduced.  That is, the TO BE IMPLEMENTED admin
commands, fetching status by unique id and the explicit support for reduce
jobs.  The last, I'm dubious about the utility of.  You could already
implement map/reduce with gearman trivially and extending the protocol
doesn't seem to gain anything other than complexity.

See the TODO document for details on other things I'd like to add.
