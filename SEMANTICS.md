Experimentally Verified Semantics
=================================

What follows are the semantics of how the C++ gearmand server handles
various edge cases.  These have all been verified experimentally, as there
is no extant documentation.

By default the Abraxas server matches these semantics.

Disconnecting Workers
---------------------

If a worker disconnects prior to sending a WORK_COMPLETE, WORK_FAIL or
WORK_EXCEPTION packet, the server will act as if it never gave that job to
the worker, requeue it and give it to the next available worker.  Clients
have no mechanism to be aware of this, as such, they may receive duplicate
data in the form of WORK_DATA packets.

In Abraxas streaming mode, a disconnect triggers a WORK_FAIL. Retries have
to be handled by the client application code.

Unique IDs
----------

If your job is submitted with a uniqueid and job is already running with
that same id, you'll be attached to the original job.  You will receive any
future packets sent to that job, but you will not receive the history up to
this point.  This means you will not see any WORK_DATA, WORK_STATUS or
WORK_WARNING packets already sent to the original client. 

In Abraxas streaming mode, a uniqueids on foreground jobs are not allowed
and result in an error.  Uniqueids are only allowed for background jobs.
