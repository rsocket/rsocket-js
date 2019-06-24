/** Copyright (c) Facebook, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */

/* eslint-disable sort-keys */

'use strict';

import {
  RSocketClient,
  BufferEncoders,
  RSocketResumableTransport,
} from 'rsocket-core';
import RSocketTcpClient from 'rsocket-tcp-client';

const maxRSocketRequestN = 2147483647;
const host = '127.0.0.1';
const port = 7000;
const resumeToken = Buffer.from('abc123');
const bufferSize = 128;
const reconnectIntervalMillis = 5000;
const sessionDurationSeconds = 20000;
const keepAlive = 60000;
const lifetime = 180000;
const dataMimeType = 'application/octet-stream';
const metadataMimeType = 'application/octet-stream';

// Create an instance of a client
let resumableTransport = new RSocketResumableTransport(
  // supplier of low-level transport
  () => new RSocketTcpClient({host, port}, BufferEncoders),
  {
    bufferSize, // max number of sent & pending frames to buffer before failing
    resumeToken, // unique identifier the session across connections
    sessionDurationSeconds,
  },
  BufferEncoders,
);

const client = new RSocketClient({
  setup: {
    keepAlive,
    lifetime,
    dataMimeType,
    metadataMimeType,
  },
  transport: resumableTransport,
});

let start = true;
resumableTransport.connectionStatus().subscribe({
  onNext: status => {
    console.log('Resumable transport status changed: ' + status.kind);

    if (status.kind === 'NOT_CONNECTED') {
      if (!start) {
        console.log('Resumable transport disconnected, retrying...');
        setTimeout(() => resumableTransport.connect(), reconnectIntervalMillis);
      } else {
        start = false;
      }
    }
  },
  onSubscribe: subscription => {
    subscription.request(Number.MAX_SAFE_INTEGER);
  },
});

// Open the connection
client.connect().subscribe({
  onComplete: socket => {
    socket
      .requestStream({
        data: new Buffer('request-stream'),
        metadata: null,
      })
      .subscribe({
        onComplete: () => console.log('Request-stream completed'),
        onError: error =>
          console.error(`Request-stream error:${error.message}`),
        onNext: value => console.log('%s', value.data),
        onSubscribe: sub => sub.request(maxRSocketRequestN),
      });
  },
  onError: error => console.error(error),
});

setTimeout(() => {}, 30000000);
