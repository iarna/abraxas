* Tests for the client/worker API layer. (The protocol layer is already fully tested.)
* The server library, along with a trivial gearman server implementation.
* Support for multiple servers with automatic failover and reconnection.
* Expose timeouts-- on-connect, reply-to-command, complete-job.
  * Some mechanism to hook any kind of network error, the multi-server variation would want this.
* Ensure errors are exposed everywhere-- socket, parser, emitter, etc
* Consider supporting the extensions that the C++ gearmand has added.

Longer term:

* Examples that include multi-process modes with the cluster module.
* Background job durability
* Sugar library that adds some basic conventions to make Gearman easier, eg:
  * Consistent job naming, complex data types as arguments, etc.
* Gearman server clustering--
  * Share responsibility for keeping background jobs in the queue
  * Route jobs to other servers if the local server is overloaded
