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

import {
  RSocketClient,
  BufferEncoders,
  encodeAndAddCustomMetadata,
  encodeAndAddWellKnownMetadata,
  TEXT_PLAIN,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
  MESSAGE_RSOCKET_ROUTING,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import WebSocket from 'ws';

const maxRSocketRequestN = 2147483647;
const host = '127.0.0.1';
const port = 7000;
const keepAlive = 60000;
const lifetime = 180000;
const dataMimeType = 'application/octet-stream';
const metadataMimeType = MESSAGE_RSOCKET_COMPOSITE_METADATA.string;
const route = 'test.service';

const client = new RSocketClient({
  setup: {
    keepAlive,
    lifetime,
    dataMimeType,
    metadataMimeType,
  },
  transport: new RSocketWebSocketClient(
    {
      url: 'ws://localhost:7000',
      wsCreator: url => new WebSocket(url),
      debug: true,
    },
    BufferEncoders,
  ),
});

// Open the connection
client.connect().then(socket => {
  socket
    .requestStream({
      data: new Buffer('request-stream'),
      metadata: encodeAndAddWellKnownMetadata(
        encodeAndAddCustomMetadata(
          Buffer.alloc(0),
          TEXT_PLAIN.string,
          Buffer.from('Hello World'),
        ),
        MESSAGE_RSOCKET_ROUTING,
        Buffer.from(String.fromCharCode(route.length) + route),
      ),
    })
    .subscribe({
      onComplete: () => console.log('Request-stream completed'),
      onError: error =>
        console.error(`Request-stream error:${error.message}`),
      onNext: value => console.log('%s %s', value.data, value.metadata),
      onSubscribe: sub => sub.request(maxRSocketRequestN),
    });
});
setTimeout(() => {}, 30000000);
