/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

'use strict';

import Deferred from 'fbjs/lib/Deferred';
import type {
  ReactiveSocket,
  ConnectionStatus,
  Payload,
  ISubscription,
} from 'rsocket-types';
import {RSocketClient, MAX_STREAM_ID} from 'rsocket-core';
import {RSocketServer} from 'rsocket-core';
import {Flowable, Single} from 'rsocket-flowable';

import {RSocketTcpClient} from 'rsocket-tcp-client';

import yargs from 'yargs';

const argv = yargs
  .usage('$0 --host <host> --port <port>')
  .options({
    host: {
      default: 'localhost',
      describe: 'server hostname.',
      type: 'string',
    },
    port: {
      default: 8080,
      describe: 'server port.',
      type: 'string',
    },
    protocol: {
      default: 'tcp',
      describe: 'the protocol.',
      type: 'string',
    },
    operation: {
      default: 'stream',
      describe: 'the operation to perform.',
      type: 'string',
    },
    payload: {
      default: 'Hi!',
      describe: 'the payload to send.',
      type: 'string',
    },
  })
  .choices('protocol', ['tcp'])
  .choices('operation', ['stream'])
  .help().argv;

Promise.resolve(run(argv)).then(
  () => {
    process.exit(0);
  },
  error => {
    console.error(error.stack);
    process.exit(1);
  },
);

type ServerOptions = {
  host?: string,
  port: number,
};

function doOperation(
  socket: ReactiveSocket<string, string>,
  operation: string,
  payload: string,
): Flowable<Payload<string, string>> {
  switch (operation) {
    case 'stream':
    default:
      console.log(`Requesting stream with payload: ${payload}`);
      return socket.requestStream({
        data: payload,
        metadata: '',
      });
  }
}

function getTransport(protocol: string, options: ServerOptions) {
  switch (protocol) {
    case 'tcp':
    default:
      return new RSocketTcpClient({...options});
  }
}

async function run(options) {
  const deferred = new Deferred();

  const serverOptions: ServerOptions = {
    host: options.host,
    port: options.port,
  };

  console.log(`Client connecting to ${options.host}:${options.port}`);
  const socketSingle = connect(options.protocol, serverOptions);

  socketSingle.subscribe({
    onComplete: socket => {
      let subscription: ISubscription;
      doOperation(socket, options.operation, options.payload).subscribe({
        onComplete() {
          console.log('onComplete()');
          deferred.resolve();
        },
        onError(error) {
          console.log('onError(%s)', error.message);
          deferred.reject(error);
        },
        onNext(payload) {
          console.log('onNext(%s)', payload.data);
        },
        onSubscribe(_subscription) {
          subscription = _subscription;
          subscription.request(MAX_STREAM_ID);
        },
      });
    },
    onError: e => {
      console.error('Failed to connect', e);
    },
  });

  return deferred.getPromise();
}

function connect(protocol: string, options: ServerOptions) {
  const client = new RSocketClient({
    setup: {
      dataMimeType: 'text/plain',
      keepAlive: 1000000, // avoid sending during test
      lifetime: 100000,
      metadataMimeType: 'text/plain',
    },
    transport: getTransport(protocol, options),
  });
  return client.connect();
}
