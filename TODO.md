Server

The server implementation is very much just a proof of concept, it's
missing many important things:

* Uniqueids actually don't behave the same as C++ gearman-- this
  should only happen if enabled via an OPTION_REQ. Alternative
  is basically the same but without any buffering.
* Spooling jobs to disk as they come in, rather then memory (replace bufr)
  and StreamReplay's buffer array. This should be plugable, with
  at least memory and disk backends.
* Job priority levels.
* Job queueing is currently FIFO, but kind of only by accident.
* Job queueing currently involves scanning the entire list of jobs. This is
  obviously non-optimal from a scaling point of view.
* Verify that foreground jobs whose workers die FAIL rather then retry.
* Admin commmands!
* Background jobs!
  * Job persistence for background jobs.
  * Worker failure retries should do the exponential backoff dance, rather then just
    dequeueing. (Dequeueing when you've promised to run something is BAD.)

General

* Tests for the client/worker API layer. (The protocol layer is already fully tested.)
* Support for multiple servers with automatic failover and reconnection.
* Expose timeouts-- on-connect, reply-to-command, complete-job.
  * Some mechanism to hook any kind of network error, the multi-server variation would want this.
* Consider supporting the extensions that the C++ gearmand has added.

Longer term:

* Examples that include multi-process modes with the cluster module.
* Background job durability
* Sugar library that adds some basic conventions to make Gearman easier, eg:
  * Consistent job naming, complex data types as arguments, etc.
* Gearman server clustering--
  * Share responsibility for keeping background jobs in the queue
  * Route jobs to other servers if the local server is overloaded
