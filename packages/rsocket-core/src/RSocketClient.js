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

'use strict';

import type {
  ConnectionStatus,
  DuplexConnection,
  Payload,
  ReactiveSocket,
  SetupFrame,
  Responder,
} from 'rsocket-types';
import type {PayloadSerializers} from './RSocketSerialization';

import {Flowable, Single, every} from 'rsocket-flowable';
import invariant from 'fbjs/lib/invariant';
import {CONNECTION_STREAM_ID, FLAGS, FRAME_TYPES} from './RSocketFrame';
import {MAJOR_VERSION, MINOR_VERSION} from './RSocketVersion';
import {createClientMachine} from './RSocketMachine';
import {Lease, Leases} from './RSocketLease';
import {RequesterLeaseHandler, ResponderLeaseHandler} from './RSocketLease';
import {IdentitySerializers} from './RSocketSerialization';
import {ReassemblyDuplexConnection} from './ReassemblyDuplexConnection';

export type ClientConfig<D, M> = {|
  serializers?: PayloadSerializers<D, M>,
  setup: {|
    payload?: Payload<D, M>,
    dataMimeType: string,
    keepAlive: number,
    lifetime: number,
    metadataMimeType: string,
  |},
  transport: DuplexConnection,
  responder?: Responder<D, M>,
  errorHandler?: (Error) => void,
  leases?: () => Leases<*>,
|};

/**
 * RSocketClient: A client in an RSocket connection that will communicates with
 * the peer via the given transport client. Provides methods for establishing a
 * connection and initiating the RSocket interactions:
 * - fireAndForget()
 * - requestResponse()
 * - requestStream()
 * - requestChannel()
 * - metadataPush()
 */
export default class RSocketClient<D, M> {
  _cancel: ?() => void;
  _config: ClientConfig<D, M>;
  _connection: ?Single<ReactiveSocket<D, M>>;
  _socket: ?RSocketClientSocket<D, M>;

  constructor(config: ClientConfig<D, M>) {
    this._checkConfig(config);
    this._cancel = null;
    this._config = config;
    this._connection = null;
    this._socket = null;
  }

  close(): void {
    this._config.transport.close();
  }

  connect(): Single<ReactiveSocket<D, M>> {
    invariant(
      !this._connection,
      'RSocketClient: Unexpected call to connect(), already connected.',
    );
    this._connection = new Single(subscriber => {
      const transport = this._config.transport;
      let subscription;
      transport.connectionStatus().subscribe({
        onNext: status => {
          if (status.kind === 'CONNECTED') {
            subscription && subscription.cancel();
            subscriber.onComplete(
              new RSocketClientSocket(
                this._config,
                new ReassemblyDuplexConnection(transport),
              ),
            );
          } else if (status.kind === 'ERROR') {
            subscription && subscription.cancel();
            subscriber.onError(status.error);
          } else if (status.kind === 'CLOSED') {
            subscription && subscription.cancel();
            subscriber.onError(new Error('RSocketClient: Connection closed.'));
          }
        },
        onSubscribe: _subscription => {
          subscriber.onSubscribe(() => _subscription.cancel());
          subscription = _subscription;
          subscription.request(Number.MAX_SAFE_INTEGER);
        },
      });
      transport.connect();
    });
    return this._connection;
  }

  _checkConfig(config: ClientConfig<D, M>) {
    const setup = config.setup;
    const keepAlive = setup && setup.keepAlive;
    // wrap in try catch since in 'strict' mode the access to an unexciting window will throw
    // the ReferenceError: window is not defined exception
    try {
      // eslint-disable-next-line no-undef
      const navigator = window && window.navigator;
      if (
        keepAlive > 30000 &&
        navigator &&
        navigator.userAgent &&
        (navigator.userAgent.includes('Trident') ||
          navigator.userAgent.includes('Edg'))
      ) {
        console.warn(
          'rsocket-js: Due to a browser bug, Internet Explorer and Edge users may experience WebSocket instability with keepAlive values longer than 30 seconds.',
        );
      }
    } catch (e) {
      // ignore the error since it means that the code is running in non browser environment
    }
  }
}

/**
 * @private
 */
class RSocketClientSocket<D, M> implements ReactiveSocket<D, M> {
  _machine: ReactiveSocket<D, M>;

  constructor(config: ClientConfig<D, M>, connection: DuplexConnection) {
    let requesterLeaseHandler: ?RequesterLeaseHandler;
    let responderLeaseHandler: ?ResponderLeaseHandler;

    const leasesSupplier = config.leases;
    if (leasesSupplier) {
      const lease = leasesSupplier();
      requesterLeaseHandler = new RequesterLeaseHandler((lease: any)._receiver);
      responderLeaseHandler = new ResponderLeaseHandler(
        (lease: any)._sender,
        (lease: any)._stats,
      );
    }
    const {keepAlive, lifetime} = config.setup;

    this._machine = createClientMachine(
      connection,
      subscriber => connection.receive().subscribe(subscriber),
      lifetime,
      config.serializers,
      config.responder,
      config.errorHandler,
      requesterLeaseHandler,
      responderLeaseHandler,
    );

    // Send SETUP
    connection.sendOne(this._buildSetupFrame(config));

    // Send KEEPALIVE frames
    const keepAliveFrames = every(keepAlive).map(() => ({
      data: null,
      flags: FLAGS.RESPOND,
      lastReceivedPosition: 0,
      streamId: CONNECTION_STREAM_ID,
      type: FRAME_TYPES.KEEPALIVE,
    }));
    connection.send(keepAliveFrames);
  }

  fireAndForget(payload: Payload<D, M>): void {
    this._machine.fireAndForget(payload);
  }

  requestResponse(payload: Payload<D, M>): Single<Payload<D, M>> {
    return this._machine.requestResponse(payload);
  }

  requestStream(payload: Payload<D, M>): Flowable<Payload<D, M>> {
    return this._machine.requestStream(payload);
  }

  requestChannel(payloads: Flowable<Payload<D, M>>): Flowable<Payload<D, M>> {
    return this._machine.requestChannel(payloads);
  }

  metadataPush(payload: Payload<D, M>): Single<void> {
    return this._machine.metadataPush(payload);
  }

  close(): void {
    this._machine.close();
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return this._machine.connectionStatus();
  }

  availability(): number {
    return this._machine.availability();
  }

  _buildSetupFrame(config: ClientConfig<D, M>): SetupFrame {
    const {
      dataMimeType,
      keepAlive,
      lifetime,
      metadataMimeType,
      payload,
    } = config.setup;

    const serializers = config.serializers || (IdentitySerializers: any);
    const data = payload ? serializers.data.serialize(payload.data) : undefined;
    const metadata = payload
      ? serializers.metadata.serialize(payload.metadata)
      : undefined;
    let flags = 0;
    if (metadata !== undefined) {
      flags |= FLAGS.METADATA;
    }
    return {
      data,
      dataMimeType,
      flags: flags | (config.leases ? FLAGS.LEASE : 0),
      keepAlive,
      lifetime,
      majorVersion: MAJOR_VERSION,
      metadata,
      metadataMimeType,
      minorVersion: MINOR_VERSION,
      resumeToken: null,
      streamId: CONNECTION_STREAM_ID,
      type: FRAME_TYPES.SETUP,
    };
  }
}
