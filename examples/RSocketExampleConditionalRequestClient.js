/**
 * Copyright 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE-examples file in the root directory of this source tree.
 */

import Deferred from 'fbjs/lib/Deferred';
import {RSocketClient} from 'rsocket-core';
import RSocketTcpClient from 'rsocket-tcp-client';

import yargs from 'yargs';

const argv = yargs
  .usage(
    '$0 --host <host> --port <port>'
  )
  .options({
    host: {
      default: '127.0.0.1',
      describe: 'server hostname.',
      type: 'string',
    },
    port: {
      default: 9898,
      describe: 'server port.',
      type: 'string',
    },
  })
  .help()
  .argv;

Promise.resolve(run(argv)).then(
  () => process.exit(0),
  error => {
    console.error(error.stack);
    process.exit(1);
  },
);

/**
 * Example client that sends requestStream, requests 5 payloads, and cancels
 * when they are received. Designed for use with the
 * conditional-request-handling example at
 *
 * github.com/RSocket/reactivesocket-cpp/tree/master/examples/conditional-request-handling
 */
async function run(options) {
  const socket = await connect(options);
  let pending = 5;
  let subscription;
  const deferred = new Deferred();
  socket.requestStream({
    data: 'Joe',
    metadata: null,
  }).subscribe({
    onComplete() {
      deferred.resolve();
      console.log('onComplete()');
    },
    onError(error) {
      console.log('onError(%s)', error.message);
      deferred.reject(error);
    },
    onNext(payload) {
      console.log('onNext(%s)', payload.data);
      if (--pending === 0) {
        console.log('cancel()');
        subscription.cancel();
        deferred.resolve();
      }
    },
    onSubscribe(_subscription) {
      console.log('requestStream(%s)', pending);
      subscription = _subscription;
      subscription.request(pending);
    },
  });
  return deferred.getPromise();
}

async function connect(options) {
  const client = new RSocketClient({
    setup: {
      dataMimeType: 'text/plain',
      keepAlive: 1000000, // avoid sending during test
      lifetime: 100000,
      metadataMimeType: 'text/plain',
    },
    transport: new RSocketTcpClient({
      host: options.host,
      port: options.port,
    }),
  });
  return await client.connect();
}
