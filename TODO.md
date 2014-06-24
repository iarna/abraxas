* Option for maximum number of jobs to run at a time per connection and/or per registered worker. Most gearman libraries only allow one per connection, but that's neither a limitation of the protocol nor the server. We can handle it trivially.
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
