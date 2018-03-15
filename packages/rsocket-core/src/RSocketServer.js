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

import type {
  DuplexConnection,
  Frame,
  FrameWithData,
  Payload,
  ReactiveSocket,
  PartialResponder,
} from 'rsocket-types';
import type {
  ISubscription,
  ISubscriber,
  IPartialSubscriber,
} from 'rsocket-types';
import type {PayloadSerializers} from './RSocketSerialization';

import {Flowable} from 'rsocket-flowable';
import invariant from 'fbjs/lib/invariant';
import {
  getFrameTypeName,
  CONNECTION_STREAM_ID,
  ERROR_CODES,
  FRAME_TYPES,
} from './RSocketFrame';
import {IdentitySerializers} from './RSocketSerialization';
import {createServerMachine} from './RSocketMachine';

export interface TransportServer {
  start(): Flowable<DuplexConnection>,
  stop(): void,
}
export type ServerConfig<D, M> = {|
  getRequestHandler: (
    socket: ReactiveSocket<D, M>,
    payload: Payload<D, M>,
  ) => PartialResponder<D, M>,
  serializers?: PayloadSerializers<D, M>,
  transport: TransportServer,
|};

/**
 * RSocketServer: A server in an RSocket connection that accepts connections
 * from peers via the given transport server.
 */
export default class RSocketServer<D, M> {
  _config: ServerConfig<D, M>;
  _connections: Set<ReactiveSocket<D, M>>;
  _started: boolean;
  _subscription: ?ISubscription;

  constructor(config: ServerConfig<D, M>) {
    this._config = config;
    this._connections = new Set();
    this._started = false;
    this._subscription = null;
  }

  start(): void {
    invariant(
      !this._started,
      'RSocketServer: Unexpected call to start(), already started.',
    );
    this._started = true;
    this._config.transport.start().subscribe({
      onComplete: this._handleTransportComplete,
      onError: this._handleTransportError,
      onNext: this._handleTransportConnection,
      onSubscribe: subscription => {
        this._subscription = subscription;
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  stop(): void {
    if (this._subscription) {
      this._subscription.cancel();
    }
    this._config.transport.stop();
    this._handleTransportError(
      new Error('RSocketServer: Connection terminated via stop().'),
    );
  }

  _handleTransportComplete = (): void => {
    this._handleTransportError(
      new Error('RSocketServer: Connection closed unexpectedly.'),
    );
  };

  _handleTransportError = (error: Error): void => {
    this._connections.forEach(connection => {
      // TODO: Allow passing in error
      connection.close();
    });
  };

  _handleTransportConnection = (connection: DuplexConnection): void => {
    const swapper: SubscriberSwapper<Frame> = new SubscriberSwapper();
    let subscription;
    connection.receive().subscribe(
      swapper.swap({
        onError: error => console.error(error),
        onNext: frame => {
          switch (frame.type) {
            case FRAME_TYPES.RESUME:
              subscription && subscription.cancel();
              connection.sendOne({
                code: ERROR_CODES.REJECTED_RESUME,
                flags: 0,
                message: 'RSocketServer: RESUME not supported.',
                streamId: CONNECTION_STREAM_ID,
                type: FRAME_TYPES.ERROR,
              });
              break;
            case FRAME_TYPES.SETUP:
              const serializers = this._getSerializers();
              // TODO: Handle getRequestHandler() throwing
              const serverMachine = createServerMachine(
                connection,
                subscriber => {
                  swapper.swap(subscriber);
                },
                serializers,
              );
              const requestHandler = this._config.getRequestHandler(
                serverMachine,
                deserializePayload(serializers, frame),
              );
              serverMachine.setRequestHandler(requestHandler);

              this._connections.add(serverMachine);
              // TODO(blom): We should subscribe to connection status
              // so we can remove the connection when it goes away
              break;
            default:
              invariant(
                false,
                'RSocketServer: Expected first frame to be SETUP or RESUME, ' +
                  'got `%s`.',
                getFrameTypeName(frame.type),
              );
          }
        },
        onSubscribe: _subscription => {
          subscription = _subscription;
          subscription.request(1);
        },
      }),
    );
  };

  _getSerializers(): PayloadSerializers<D, M> {
    return this._config.serializers || (IdentitySerializers: any);
  }
}

class SubscriberSwapper<T> implements ISubscriber<T> {
  _target: ?IPartialSubscriber<T>;
  _subscription: ?ISubscription;

  constructor(target?: IPartialSubscriber<T>) {
    this._target = target;
  }

  swap(next: IPartialSubscriber<T>): ISubscriber<T> {
    this._target = next;
    if (this._subscription) {
      this._target.onSubscribe && this._target.onSubscribe(this._subscription);
    }
    return this;
  }

  onComplete() {
    invariant(this._target, 'must have target');
    this._target.onComplete && this._target.onComplete();
  }
  onError(error) {
    invariant(this._target, 'must have target');
    this._target.onError && this._target.onError(error);
  }
  onNext(value: T) {
    invariant(this._target, 'must have target');
    this._target.onNext && this._target.onNext(value);
  }
  onSubscribe(subscription: ISubscription) {
    invariant(this._target, 'must have target');
    this._subscription = subscription;
    this._target.onSubscribe && this._target.onSubscribe(subscription);
  }
}

function deserializePayload<D, M>(
  serializers: PayloadSerializers<D, M>,
  frame: FrameWithData,
): Payload<D, M> {
  return {
    data: serializers.data.deserialize(frame.data),
    metadata: serializers.metadata.deserialize(frame.metadata),
  };
}
