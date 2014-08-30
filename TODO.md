General

* Tests for the client/worker API layer. (The protocol layer is already fully tested.)
* Consider supporting the extensions that the C++ gearmand has added.

Server

The server implementation is very much just a proof of concept, it's
missing many important things:

* Server is known to leak memory, track this down.
* Spooling jobs to disk as they come in, rather then memory (StreamReplay)
  This should be plugable, with at least memory and disk backends.
* Job queueing currently involves scanning the entire list of jobs. This is
  likely a choke point, but load testing is called for first.
* Admin commmands!
* Worker failure retries should do the exponential backoff dance, rather then immediately requeueing.

Longer term:

* Server: Background job durability
* Client/Worker: Sugar library that adds some basic conventions to make Gearman easier, eg:
  * Consistent job naming, complex data types as arguments, etc.
* Gearman server clustering--
  * Share responsibility for keeping background jobs in the queue
  * Route jobs to other servers if the local server is overloaded
