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

import {RTCPeerConnection} from 'wrtc';
import {
  BufferEncoders,
  encodeCompositeMetadata,
  encodeRoute,
  encodeSimpleAuthMetadata,
  MESSAGE_RSOCKET_AUTHENTICATION,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
  MESSAGE_RSOCKET_ROUTING,
  RSocketClient,
  RSocketServer,
  TEXT_PLAIN,
} from 'rsocket-core';
import RSocketWebRTCClient from 'rsocket-webrtc-client';
import RSocketWebRTCServerTransport from 'rsocket-webrtc-server';
import type {Payload} from 'rsocket-types';
import {every, Flowable} from 'rsocket-flowable';

const maxRSocketRequestN = 2147483647;
const keepAlive = 60000;
const lifetime = 180000;
const dataMimeType = 'application/octet-stream';
const metadataMimeType = MESSAGE_RSOCKET_COMPOSITE_METADATA.string;
const route = 'test.service';

const localConnection = new RTCPeerConnection();
const remoteConnection = new RTCPeerConnection();

localConnection.addEventListener('icecandidate', async e => {
  console.log('local connection ICE candidate: ', e.candidate);
  if (e.candidate) {
    await remoteConnection.addIceCandidate(e.candidate);
  }
});
remoteConnection.addEventListener('icecandidate', async e => {
  console.log('remote connection ICE candidate: ', e.candidate);
  if (e.candidate) {
    await localConnection.addIceCandidate(e.candidate);
  }
});

const initLocalOffer = async () => {
  const localOffer = await localConnection.createOffer();
  console.log(`Got local offer ${JSON.stringify(localOffer)}`);
  const localDesc = localConnection.setLocalDescription(localOffer);
  const remoteDesc = remoteConnection.setRemoteDescription(localOffer);
  return Promise.all([localDesc, remoteDesc]);
};

const initRemoteAnswer = async () => {
  const remoteAnswer = await remoteConnection.createAnswer();
  console.log(`Got remote answer ${JSON.stringify(remoteAnswer)}`);
  const localDesc = remoteConnection.setLocalDescription(remoteAnswer);
  const remoteDesc = localConnection.setRemoteDescription(remoteAnswer);
  return Promise.all([localDesc, remoteDesc]);
};

const serverTransport = new RSocketWebRTCServerTransport(
  {
    rtcDataChannelProvider: new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: () => {},
        request: n => {},
      });
      remoteConnection.addEventListener('datachannel', dataChannelEvent =>
        subscriber.onNext(dataChannelEvent.channel)
      );
    }),
  },
  BufferEncoders
);

const server = new RSocketServer({
  getRequestHandler: (requestingRSocket, setupPayload) => {
    return {
      requestStream: (payload: Payload<Buffer, Buffer>) => {
        // eslint-disable-next-line no-console
        console.log(
          `Received Payload(data : ${
            payload.data ? payload.data.toString() : ''
          }; metadata : ${payload.metadata ? payload.metadata.toString() : ''}`
        );
        return every(1000).map(tick => ({
          data: Buffer.from('Tick: ' + tick),
          metadata: Buffer.from([tick]),
        }));
      },
    };
  },
  transport: serverTransport,
});
// Start Server
server.start();


const client = new RSocketClient<Buffer, Buffer>({
  setup: {
    dataMimeType,
    keepAlive,
    lifetime,
    metadataMimeType,
  },
  transport: new RSocketWebRTCClient(
    {
      debug: true,
      // url: 'ws://localhost:7000',
      rtcDataChannelCreator: async options => {
        const dataChannel = localConnection.createDataChannel('someName', options);

        await initLocalOffer();
        await initRemoteAnswer();

        console.log('handshake completed');

        return dataChannel;
      },
    },
    BufferEncoders,
  ),
});

// Open the connection
client.connect().then(socket => {
  console.log('Client has connected to remote party');
  socket
    .requestStream({
      data: new Buffer('request-stream'),
      metadata: encodeCompositeMetadata([
        [TEXT_PLAIN, Buffer.from('Hello World')],
        [MESSAGE_RSOCKET_ROUTING, encodeRoute(route)],
        [
          MESSAGE_RSOCKET_AUTHENTICATION,
          encodeSimpleAuthMetadata('user', 'pass'),
        ],
        ['custom/test/metadata', Buffer.from([1, 2, 3])],
      ]),
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
