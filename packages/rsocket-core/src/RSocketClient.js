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
  Payload,
  ReactiveSocket,
  Frame,
  SetupFrame,
} from '../../ReactiveSocketTypes';
import type {ISubject} from '../../ReactiveStreamTypes';
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
  FLAGS,
  FRAME_TYPES,
  MAX_REQUEST_N,
  MAX_STREAM_ID,
} from './RSocketFrame';
import {MAJOR_VERSION, MINOR_VERSION} from './RSocketVersion';
import {IdentitySerializers} from './RSocketSerialization';

export interface TransportClient {
  connect(): Single<DuplexConnection>,
}
export type ClientConfig<D, M> = {|
  serializers?: {
    data: Serializer<D>,
    metadata: Serializer<M>,
  },
  setup: {|
    dataMimeType: string,
    keepAlive: number,
    lifetime: number,
    metadataMimeType: string,
  |},
  transport: TransportClient,
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
    this._cancel = null;
    this._config = config;
    this._connection = null;
    this._socket = null;
  }

  close(): void {
    if (this._cancel) {
      this._cancel();
      this._cancel = null;
    }
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
  }

  connect(): Single<ReactiveSocket<D, M>> {
    invariant(
      !this._connection,
      'RSocketClient: Unexpected call to connect(), already connected.',
    );
    this._connection = new Single(subscriber => {
      this._config.transport.connect().subscribe({
        onComplete: connection => {
          const socket = new RSocketClientSocket(this._config, connection);
          this._socket = socket;
          subscriber.onComplete(socket);
        },
        onError: error => subscriber.onError(error),
        onSubscribe: cancel => {
          this._cancel = cancel;
          subscriber.onSubscribe(cancel);
        },
      });
    });
    return this._connection;
  }
}

/**
 * @private
 */
class RSocketClientSocket<D, M> implements ReactiveSocket<D, M> {
  _close: Deferred<void, Error>;
  _config: ClientConfig<D, M>;
  _connection: DuplexConnection;
  _nextStreamId: number;
  _receivers: Map<number, ISubject<Payload<D, M>>>;
  _serializers: {
    data: Serializer<D>,
    metadata: Serializer<M>,
  };
  _serverPosition: number;

  constructor(config: ClientConfig<D, M>, connection: DuplexConnection) {
    this._close = new Deferred();
    this._config = config;
    this._connection = connection;
    this._nextStreamId = 1;
    this._receivers = new Map();
    this._serializers = config.serializers || (IdentitySerializers: any);
    this._serverPosition = 0;

    // Subscribe to completion/errors before sending anything
    this._connection.receive().subscribe({
      onComplete: this._handleConnectionClose,
      onError: this._handleConnectionError,
      onNext: this._handleFrame,
      onSubscribe: subscription =>
        subscription.request(Number.MAX_SAFE_INTEGER),
    });

    // Send SETUP
    this._connection.sendOne(this._buildSetupFrame());

    // Send KEEPALIVE frames
    const {keepAlive} = this._config.setup;
    const keepAliveFrames = every(keepAlive).map(() => ({
      data: null,
      flags: FLAGS.RESPOND,
      lastReceivedPosition: this._serverPosition,
      streamId: CONNECTION_STREAM_ID,
      type: FRAME_TYPES.KEEPALIVE,
    }));
    this._connection.send(keepAliveFrames);

    // Cleanup when the connection closes
    this._connection
      .onClose()
      .then(this._handleConnectionClose, this._handleConnectionError);
  }

  close(): void {
    this._close.resolve();
    this._connection.close();
  }

  onClose(): Promise<void> {
    return this._close.getPromise();
  }

  fireAndForget(payload: Payload<D, M>): void {
    const streamId = this._getNextStreamId();
    const data = this._serializers.data.serialize(payload.data);
    const metadata = this._serializers.metadata.serialize(payload.metadata);
    const frame = {
      data,
      flags: payload.metadata !== undefined ? FLAGS.METADATA : 0,
      metadata,
      streamId,
      type: FRAME_TYPES.REQUEST_FNF,
    };
    this._connection.sendOne(frame);
  }

  requestResponse(payload: Payload<D, M>): Single<Payload<D, M>> {
    const streamId = this._getNextStreamId();
    return new Single(subscriber => {
      this._receivers.set(streamId, {
        onComplete: emptyFunction,
        onError: error => subscriber.onError(error),
        onNext: data => subscriber.onComplete(data),
      });
      const data = this._serializers.data.serialize(payload.data);
      const metadata = this._serializers.metadata.serialize(payload.metadata);
      const frame = {
        data,
        flags: payload.metadata !== undefined ? FLAGS.METADATA : 0,
        metadata,
        streamId,
        type: FRAME_TYPES.REQUEST_RESPONSE,
      };
      this._connection.sendOne(frame);

      subscriber.onSubscribe(() => {
        this._receivers.delete(streamId);
        const cancelFrame = {
          flags: 0,
          streamId,
          type: FRAME_TYPES.CANCEL,
        };
        this._connection.sendOne(cancelFrame);
      });
    });
  }

  requestStream(payload: Payload<D, M>): Flowable<Payload<D, M>> {
    const streamId = this._getNextStreamId();
    return new Flowable(
      subscriber => {
        this._receivers.set(streamId, subscriber);
        let initialized = false;

        subscriber.onSubscribe({
          cancel: () => {
            this._receivers.delete(streamId);
            if (!initialized) {
              return;
            }
            const cancelFrame = {
              flags: 0,
              streamId,
              type: FRAME_TYPES.CANCEL,
            };
            this._connection.sendOne(cancelFrame);
          },
          request: n => {
            if (n > MAX_REQUEST_N) {
              warning(
                false,
                'RSocketClient: Invalid request value `%s`, the maximum ' +
                  'value supported by the RSocket protocol is `%s`. Sending ' +
                  'the maximum supported value instead.',
                n,
                MAX_REQUEST_N,
              );
              n = MAX_REQUEST_N;
            }
            if (initialized) {
              const requestNFrame = {
                flags: 0,
                requestN: n,
                streamId,
                type: FRAME_TYPES.REQUEST_N,
              };
              this._connection.sendOne(requestNFrame);
            } else {
              initialized = true;
              const data = this._serializers.data.serialize(payload.data);
              const metadata = this._serializers.metadata.serialize(
                payload.metadata,
              );
              const requestStreamFrame = {
                data,
                flags: payload.metadata !== undefined ? FLAGS.METADATA : 0,
                metadata,
                requestN: n,
                streamId,
                type: FRAME_TYPES.REQUEST_STREAM,
              };
              this._connection.sendOne(requestStreamFrame);
            }
          },
        });
      },
      MAX_REQUEST_N,
    );
  }

  requestChannel(payloads: Flowable<Payload<D, M>>): Flowable<Payload<D, M>> {
    // TODO #18065296: implement requestChannel
    throw new Error('requestChannel() is not implemented');
  }

  metadataPush(payload: Payload<D, M>): Single<void> {
    // TODO #18065331: implement metadataPush
    throw new Error('metadataPush() is not implemented');
  }

  _getNextStreamId(): number {
    const streamId = this._nextStreamId;
    invariant(
      streamId <= MAX_STREAM_ID,
      'RSocketClient: Cannot issue request, maximum stream id reached (%s).',
      MAX_STREAM_ID,
    );
    this._nextStreamId += 2;
    return streamId;
  }

  /**
   * Handle the connection closing normally: this is an error for any open streams.
   */
  _handleConnectionClose = (): void => {
    this._handleConnectionError(
      new Error('RSocketClient: The connection was closed.'),
    );
  };

  /**
   * Handle the transport connection closing abnormally or a connection-level protocol error.
   */
  _handleConnectionError = (error: Error) => {
    // Error any open request streams
    this._receivers.forEach(receiver => {
      receiver.onError(error);
    });
    this._receivers.clear();
    // In case of a protocol-level error, close the stream.
    this._connection.close();
    // Resolve onClose()
    this._close.reject(error);
  };

  /**
   * Handle a frame received from the transport client.
   */
  _handleFrame = (frame: Frame) => {
    const {streamId} = frame;
    if (streamId === CONNECTION_STREAM_ID) {
      this._handleConnectionFrame(frame);
    } else {
      this._handleStreamFrame(streamId, frame);
    }
  };

  /**
   * Handle connection frames (stream id === 0).
   */
  _handleConnectionFrame(frame: Frame): void {
    switch (frame.type) {
      case FRAME_TYPES.ERROR:
        const error = createErrorFromFrame(frame);
        this._handleConnectionError(error);
        break;
      case FRAME_TYPES.EXT:
        // Extensions are not supported
        break;
      case FRAME_TYPES.KEEPALIVE:
        if (isRespond(frame.flags)) {
          this._connection.sendOne({
            ...frame,
            flags: frame.flags ^ FLAGS.RESPOND, // eslint-disable-line no-bitwise
            lastReceivedPosition: this._serverPosition,
          });
        }
        break;
      case FRAME_TYPES.LEASE:
        // TODO #18064860: support lease
        break;
      case FRAME_TYPES.METADATA_PUSH:
      case FRAME_TYPES.REQUEST_CHANNEL:
      case FRAME_TYPES.REQUEST_FNF:
      case FRAME_TYPES.REQUEST_RESPONSE:
      case FRAME_TYPES.REQUEST_STREAM:
        // TODO #18064706: handle requests from server, increment serverPosition
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
            'RSocketClient: Unsupported frame type `%s` on stream `%s`.',
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
  _handleStreamFrame(streamId: number, frame: Frame): void {
    switch (frame.type) {
      case FRAME_TYPES.CANCEL:
        // TODO #18064706: cancel requests from server, increment serverPosition
        break;
      case FRAME_TYPES.ERROR:
        this._serverPosition++;
        const error = createErrorFromFrame(frame);
        this._handleStreamError(streamId, error);
        break;
      case FRAME_TYPES.PAYLOAD:
        this._serverPosition++;
        const receiver = this._receivers.get(streamId);
        if (receiver != null) {
          if (isNext(frame.flags)) {
            const payload = {
              data: this._serializers.data.deserialize(frame.data),
              metadata: this._serializers.metadata.deserialize(frame.metadata),
            };
            receiver.onNext(payload);
          }
          if (isComplete(frame.flags)) {
            this._receivers.delete(streamId);
            receiver.onComplete();
          }
        }
        break;
      case FRAME_TYPES.REQUEST_N:
        // TODO #18064706: handle requests from server, increment serverPosition
        break;
      default:
        if (__DEV__) {
          console.log(
            'RSocketClient: Unsupported frame type `%s` on stream `%s`.',
            getFrameTypeName(frame.type),
            streamId,
          );
        }
        break;
    }
  }

  /**
   * Handle an error specific to a stream.
   */
  _handleStreamError(streamId: number, error: Error): void {
    const receiver = this._receivers.get(streamId);
    if (receiver != null) {
      this._receivers.delete(streamId);
      receiver.onError(error);
    }
  }

  _buildSetupFrame(): SetupFrame {
    const {
      dataMimeType,
      keepAlive,
      lifetime,
      metadataMimeType,
    } = this._config.setup;
    return {
      data: undefined,
      dataMimeType,
      flags: 0,
      keepAlive,
      lifetime,
      majorVersion: MAJOR_VERSION,
      metadata: undefined,
      metadataMimeType,
      minorVersion: MINOR_VERSION,
      resumeToken: '',
      streamId: CONNECTION_STREAM_ID,
      type: FRAME_TYPES.SETUP,
    };
  }
}
