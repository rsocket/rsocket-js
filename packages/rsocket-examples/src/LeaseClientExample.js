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

import type {Responder, Payload} from 'rsocket-types';
import {Leases, Lease, RSocketClient} from 'rsocket-core';
import {Flowable, Single, every} from 'rsocket-flowable';
import RSocketTcpClient from 'rsocket-tcp-client';

const address = {host: 'localhost', port: 7000};

function make(data: string): Payload<string, string> {
  return {
    data,
    metadata: '',
  };
}

function logRequest(type: string, payload: Payload<string, string>) {
  console.log(`Responder response to ${type}, data: ${payload.data || 'null'}`);
}

class EchoResponder implements Responder<string, string> {
  metadataPush(payload: Payload<string, string>): Single<void> {
    return Single.error(new Error('not implemented'));
  }

  fireAndForget(payload: Payload<string, string>): void {
    logRequest('fire-and-forget', payload);
  }

  requestResponse(
    payload: Payload<string, string>,
  ): Single<Payload<string, string>> {
    logRequest('request-response', payload);
    return Single.of(make('client response'));
  }

  requestStream(
    payload: Payload<string, string>,
  ): Flowable<Payload<string, string>> {
    logRequest('request-stream', payload);
    return Flowable.just(make('client stream response'));
  }

  requestChannel(
    payloads: Flowable<Payload<string, string>>,
  ): Flowable<Payload<string, string>> {
    return Flowable.just(make('client channel response'));
  }
}

function getClientTransport(host: string, port: number) {
  return new RSocketTcpClient({
    host,
    port,
  });
}

const receivedLeasesLogger: (Flowable<Lease>) => void = lease =>
  lease.subscribe({
    onSubscribe: s => s.request(Number.MAX_SAFE_INTEGER),
    onNext: lease =>
      console.log(
        `Received lease - ttl: ${lease.timeToLiveMillis}, requests: ${lease.allowedRequests}`,
      ),
  });

function periodicLeaseSender(
  intervalMillis: number,
  ttl: number,
  allowedRequests: number,
): Flowable<Lease> {
  return every(intervalMillis).map(v => {
    console.log(`Sent lease - ttl: ${ttl}, requests: ${allowedRequests}`);
    return new Lease(ttl, allowedRequests);
  });
}

const client = new RSocketClient({
  setup: {
    dataMimeType: 'text/plain',
    keepAlive: 1000000,
    lifetime: 100000,
    metadataMimeType: 'text/plain',
  },
  responder: new EchoResponder(),
  leases: () =>
    new Leases()
      .receiver(receivedLeasesLogger)
      .sender(stats => periodicLeaseSender(10000, 7000, 10)),
  transport: getClientTransport(address.host, address.port),
});

client.connect().subscribe({
  onComplete: rSocket => {
    every(1000).subscribe({
      onNext: time => {
        console.log(`Requester availability: ${rSocket.availability()}`);
        rSocket
          .requestResponse({
            data: time.toString(),
            metadata: '',
          })
          .subscribe({
            onComplete: response => {
              const data = response.data;
              if (data) {
                console.log(`Requester response: ${data}`);
              }
            },
            onError: error =>
              console.log(`Requester error: ${error.message}`),
          });
      },
      onSubscribe: subscription =>
        subscription.request(Number.MAX_SAFE_INTEGER),
    });
    console.log('RSocket completed');

    rSocket.connectionStatus().subscribe(status => {
      console.log('Connection status:', status);
    });
  },
  onError: error => console.log(`RSocket error: ${error.message}`),
});

setTimeout(() => {}, 360000);
