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
  RSocketServer,
  BufferEncoders,
  decodeSimpleAuthPayload,
  MESSAGE_RSOCKET_AUTHENTICATION,
  SIMPLE,
  decodeAuthMetadata,
  CompositeMetadata,
} from 'rsocket-core';
import type {Payload} from 'rsocket-types';
import {every} from 'rsocket-flowable';
import RSocketWebSocketServerTransport from 'rsocket-websocket-server';

const host = '127.0.0.1';
const port = 7000;

const serverTransport = new RSocketWebSocketServerTransport(
  {
    host,
    port,
  },
  BufferEncoders,
);

const server = new RSocketServer({
  getRequestHandler: (requestingRSocket, setupPayload) => {
    const decodedMetadata: CompositeMetadata = new CompositeMetadata(
      setupPayload.metadata,
    );

    for (const metadataEntry of decodedMetadata) {
      if (metadataEntry.mimeType === MESSAGE_RSOCKET_AUTHENTICATION.string) {
        const authMetadata = decodeAuthMetadata(metadataEntry.content);

        if (authMetadata.type.string === SIMPLE.string) {
          const usernameAndPassword = decodeSimpleAuthPayload(
            authMetadata.payload,
          );

          if (
            usernameAndPassword.username.toString() === 'user' &&
            usernameAndPassword.password.toString() === 'pass'
          ) {
            return {
              requestStream: (payload: Payload<Buffer, Buffer>) => {
                // eslint-disable-next-line no-console
                console.log(
                  `Received Payload(data : ${
                    payload.data ? payload.data.toString() : ''
                  }; metadata : ${
                    payload.metadata ? payload.metadata.toString() : ''
                  }`,
                );
                return every(1000).map(tick => ({
                  data: Buffer.from([tick]),
                  metadata: Buffer.from([tick]),
                }));
              },
            };
          }
        }
      }
    }

    throw new Error('Unauthorized Access');
  },
  transport: serverTransport,
});
// Start Server
server.start();
setTimeout(() => {}, 30000000);
