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
  CancelFrame,
  DuplexConnection,
  ErrorFrame,
  Frame,
  FrameWithData,
  Payload,
  PayloadFrame,
  ReactiveSocket,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
  SetupFrame,
} from 'rsocket-types';
import type {ISubject, ISubscription} from 'rsocket-types';
import type {Serializer} from './RSocketSerialization';

import {Flowable, Single, every} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import emptyFunction from 'fbjs/lib/emptyFunction';
import invariant from 'fbjs/lib/invariant';
import warning from 'fbjs/lib/warning';
import {
  createErrorFromFrame,
  getFrameTypeName,
  isComplete,
  isNext,
  isRespond,
  CONNECTION_STREAM_ID,
  ERROR_CODES,
  FLAGS,
  FRAME_TYPES,
  MAX_REQUEST_N,
  MAX_STREAM_ID,
} from './RSocketFrame';
import {MAJOR_VERSION, MINOR_VERSION} from './RSocketVersion';
import {IdentitySerializers} from './RSocketSerialization';

export interface TransportServer {
  start(): Flowable<DuplexConnection>,
  stop(): void,
}
export type ServerConfig<D, M> = {|
  getRequestHandler: (payload: Payload<D, M>) => ReactiveSocket<D, M>,
  serializers?: {
    data: Serializer<D>,
    metadata: Serializer<M>,
  },
  transport: TransportServer,
|};

/**
 * RSocketServer: A server in an RSocket connection that accepts connections
 * from peers via the given transport server.
 */
export default class RSocketServer<D, M> {
  _config: ServerConfig<D, M>;
  _connections: Set<RSocketConnection<D, M>>;
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

  _handleTransportComplete(): void {
    this._handleTransportError(
      new Error('RSocketServer: Connection closed unexpectedly.'),
    );
  }

  _handleTransportError(error: Error): void {
    this._connections.forEach(connection => {
      connection.handleConnectionError(error);
    });
  }

  _handleTransportConnection(connection: DuplexConnection): void {
    let subscription;
    connection.receive().subscribe({
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
            subscription && subscription.cancel();
            const socketConnection = new RSocketConnection(
              connection,
              frame,
              this._config,
            );
            this._connections.add(socketConnection);
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
    });
  }
}

/**
 * @private
 */
class RSocketConnection<D, M> {
  _connection: DuplexConnection;
  _requestHandler: ReactiveSocket<D, M>;
  _serializers: {
    data: Serializer<D>,
    metadata: Serializer<M>,
  };
  _subscriptions: Map<number, ISubscription>;

  constructor(
    connection: DuplexConnection,
    setup: SetupFrame,
    config: ServerConfig<D, M>,
  ) {
    const payload = this.deserializePayload(setup);
    this._connection = connection;
    this._requestHandler = config.getRequestHandler(payload);
    this._serializers = config.serializers || (IdentitySerializers: any);
    this._subscriptions = new Map();

    // Accept all frames from the client
    connection.receive().subscribe({
      onComplete: this.handleConnectionClose,
      onError: this.handleConnectionError,
      onNext: this.handleFrame,
      onSubscribe: subscription => {
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  /**
   * Handle the connection closing normally: this is an error for any open
   * streams.
   */
  handleConnectionClose = (): void => {
    this.handleConnectionError(
      new Error('RSocketServer: The connection was closed.'),
    );
  };

  /**
   * Handle the transport connection closing abnormally or a connection-level
   * protocol error.
   */
  handleConnectionError = (error: Error) => {
    this._subscriptions.forEach(subscription => {
      subscription.cancel();
    });
    this._subscriptions.clear();
  };

  /**
   * Handle a frame received from the transport client.
   */
  handleFrame = (frame: Frame) => {
    const {streamId} = frame;
    if (streamId === 0) {
      this.handleConnectionFrame(frame);
    } else {
      this.handleStreamFrame(streamId, frame);
    }
  };

  /**
   * Handle connection frames (stream id === 0).
   */
  handleConnectionFrame(frame: Frame): void {
    switch (frame.type) {
      case FRAME_TYPES.ERROR:
        const error = createErrorFromFrame(frame);
        this.handleConnectionError(error);
        break;
      case FRAME_TYPES.EXT:
        // Extensions are not supported
        break;
      case FRAME_TYPES.KEEPALIVE:
        if (isRespond(frame.flags)) {
          this._connection.sendOne({
            ...frame,
            lastReceivedPosition: 0,
            flags: frame.flags ^ FLAGS.RESPOND,
          });
        }
        break;
      case FRAME_TYPES.LEASE:
        // TODO #18064860: support lease
        break;
      case FRAME_TYPES.RESERVED:
        // No-op
        break;
      case FRAME_TYPES.RESUME:
      case FRAME_TYPES.RESUME_OK:
        // TODO #18065016: support resumption
        break;
      default:
        if (__DEV__) {
          console.log(
            'RSocketServer: Unsupported frame type `%s` on stream `%s`.',
            getFrameTypeName(frame.type),
            CONNECTION_STREAM_ID,
          );
        }
        break;
    }
  }

  /**
   * Handle stream-specific frames (stream id !== 0).
   */
  handleStreamFrame(streamId: number, frame: Frame): void {
    switch (frame.type) {
      case FRAME_TYPES.CANCEL:
        this.handleCancel(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_N:
        this.handleRequestN(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_FNF:
        this.handleFireAndForget(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_RESPONSE:
        this.handleRequestResponse(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_STREAM:
        this.handleRequestStream(streamId, frame);
        break;
      default:
        if (__DEV__) {
          console.log(
            'RSocketServer: Unsupported frame type `%s` on stream `%s`.',
            getFrameTypeName(frame.type),
            streamId,
          );
        }
        break;
    }
  }

  handleCancel(streamId: number, frame: CancelFrame): void {
    const subscription = this._subscriptions.get(streamId);
    if (subscription) {
      subscription.cancel();
      this._subscriptions.delete(streamId);
    }
  }

  handleRequestN(streamId: number, frame: RequestNFrame): void {
    const subscription = this._subscriptions.get(streamId);
    if (subscription) {
      subscription.request(frame.requestN);
    }
  }

  handleFireAndForget(streamId: number, frame: RequestFnfFrame): void {
    const payload = this.deserializePayload(frame);
    this._requestHandler.fireAndForget(payload);
  }

  handleRequestResponse(streamId: number, frame: RequestResponseFrame): void {
    const payload = this.deserializePayload(frame);
    this._requestHandler.requestResponse(payload).subscribe({
      onComplete: payload => {
        this.sendStreamPayload(streamId, payload, true);
      },
      onError: error => this.sendStreamError(streamId, error),
      onSubscribe: cancel => {
        const subscription = {
          cancel,
          request: emptyFunction,
        };
        this._subscriptions.set(streamId, subscription);
      },
    });
  }

  handleRequestStream(streamId: number, frame: RequestStreamFrame): void {
    const payload = this.deserializePayload(frame);
    this._requestHandler.requestStream(payload).subscribe({
      onComplete: () => this.sendStreamComplete(streamId),
      onError: error => this.sendStreamError(streamId, error),
      onNext: payload => this.sendStreamPayload(streamId, payload),
      onSubscribe: subscription => {
        this._subscriptions.set(streamId, subscription);
        subscription.request(frame.requestN);
      },
    });
  }

  sendStreamComplete(streamId: number): void {
    this._subscriptions.delete(streamId);
    this._connection.sendOne({
      data: null,
      flags: FLAGS.COMPLETE,
      metadata: null,
      streamId,
      type: FRAME_TYPES.PAYLOAD,
    });
  }

  sendStreamError(streamId: number, error: Error): void {
    this._subscriptions.delete(streamId);
    this._connection.sendOne({
      code: ERROR_CODES.APPLICATION_ERROR,
      flags: 0,
      message: error.message,
      streamId,
      type: FRAME_TYPES.ERROR,
    });
  }

  sendStreamPayload(
    streamId: number,
    payload: Payload<D, M>,
    isComplete?: boolean = false,
  ): void {
    let flags = FLAGS.NEXT;
    if (isComplete) {
      flags |= FLAGS.COMPLETE;
      this._subscriptions.delete(streamId);
    }
    const data = this._serializers.data.serialize(payload.data);
    const metadata = this._serializers.metadata.serialize(payload.metadata);
    this._connection.sendOne({
      data,
      flags,
      metadata,
      streamId,
      type: FRAME_TYPES.PAYLOAD,
    });
  }

  deserializePayload(frame: FrameWithData): Payload<D, M> {
    return {
      data: this._serializers.data.deserialize(frame.data),
      metadata: this._serializers.metadata.deserialize(frame.metadata),
    };
  }
}
