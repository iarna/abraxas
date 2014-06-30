*Please note, this is just notes that I've written to myself. They describe
a hypothetical library built on top of Abraxas.  Not something bundled.*

Gearman is a *schemaless job server*, with realtime and durable background
job execution.

Create a library that provides a highlevel gearman client connection:

    var worker = new GearmanWorker();
    worker.register('mail', {
        'send': function (from,to,subject,body) { ...; return msgid; },
        'recv': function (to) { ...; return [ {msg1}, {msg2} ... ]; },
    });

Registers two jobs, mail.send and mail.recv with the server. Arguments are
automatically decoded and results encoded.  Results can also be promises
that resolve into results.

    var client = new GearmanClient();

    client.mail.send('alice@company.com','bob@company.com','Testing','This is our test').then(function (msgid) {
        ...
    });
    client.mail.recv('alice@company.com').then(function(mail) {
        ...
    });

The client would proxy any attributes accessed as data into more proxy
objects.  Ultimately calling one as a function would submit the job.

Encoding would be jsoni or something similar to it, that can actually serialize JS types.

