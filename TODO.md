Server

The server implementation is very much just a proof of concept, it's
missing many important things:

* Spooling jobs to disk as they come in, rather then memory (StreamReplay)
  This should be plugable, with at least memory and disk backends.
* Job queueing currently involves scanning the entire list of jobs. This is
  likely a scalaing choke point, but load testing is called for first.
* Admin commmands!
* Worker failure retries should do the exponential backoff dance, rather then immediately requeueing.

Worker

* Disable WORK_DATA packets when not in streaming mode (buffer for
  WORK_COMPLETE instead).  Add data command to explicitly send WORK_DATA
  packets even in streaming mode.

General

* Tests for the client/worker API layer. (The protocol layer is already fully tested.)
* Expose timeouts-- on-connect, reply-to-command, complete-job.
  * Some mechanism to hook any kind of network error, the multi-server variation would want this.
* Support for multiple servers with automatic failover and reconnection.
* Consider supporting the extensions that the C++ gearmand has added.

Longer term:

* Examples that include multi-process modes with the cluster module.
* Background job durability
* Sugar library that adds some basic conventions to make Gearman easier, eg:
  * Consistent job naming, complex data types as arguments, etc.
* Gearman server clustering--
  * Share responsibility for keeping background jobs in the queue
  * Route jobs to other servers if the local server is overloaded
