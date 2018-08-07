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
  CancelFrame,
  ConnectionStatus,
  DuplexConnection,
  Frame,
  FrameWithData,
  Payload,
  Responder,
  PartialResponder,
  ReactiveSocket,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
  RequestChannelFrame,
} from 'rsocket-types';
import type {ISubject, ISubscription, IPartialSubscriber} from 'rsocket-types';
import type {PayloadSerializers} from './RSocketSerialization';

import {Flowable, FlowableProcessor, Single} from 'rsocket-flowable';
import emptyFunction from 'fbjs/lib/emptyFunction';
import invariant from 'fbjs/lib/invariant';
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
import {IdentitySerializers} from './RSocketSerialization';

type Role = 'CLIENT' | 'SERVER';

class ResponderWrapper<D, M> implements Responder<D, M> {
  _responder: PartialResponder<D, M>;

  constructor(responder: ?PartialResponder<D, M>) {
    this._responder = responder || {};
  }

  setResponder(responder: ?PartialResponder<D, M>): void {
    this._responder = responder || {};
  }

  fireAndForget(payload: Payload<D, M>): void {
    if (this._responder.fireAndForget) {
      try {
        this._responder.fireAndForget(payload);
      } catch (error) {
        console.error('fireAndForget threw an exception', error);
      }
    }
  }

  requestResponse(payload: Payload<D, M>): Single<Payload<D, M>> {
    let error: ?Error;
    if (this._responder.requestResponse) {
      try {
        return this._responder.requestResponse(payload);
      } catch (_error) {
        console.error('requestResponse threw an exception', _error);
        error = _error;
      }
    }
    return Single.error(error || new Error('not implemented'));
  }

  requestStream(payload: Payload<D, M>): Flowable<Payload<D, M>> {
    let error: ?Error;
    if (this._responder.requestStream) {
      try {
        return this._responder.requestStream(payload);
      } catch (_error) {
        console.error('requestStream threw an exception', _error);
        error = _error;
      }
    }
    return Flowable.error(error || new Error('not implemented'));
  }

  requestChannel(payloads: Flowable<Payload<D, M>>): Flowable<Payload<D, M>> {
    let error: ?Error;
    if (this._responder.requestChannel) {
      try {
        return this._responder.requestChannel(payloads);
      } catch (_error) {
        console.error('requestChannel threw an exception', _error);
        error = _error;
      }
    }
    return Flowable.error(error || new Error('not implemented'));
  }

  metadataPush(payload: Payload<D, M>): Single<void> {
    let error: ?Error;
    if (this._responder.metadataPush) {
      try {
        return this._responder.metadataPush(payload);
      } catch (_error) {
        console.error('metadataPush threw an exception', _error);
        error = _error;
      }
    }
    return Single.error(error || new Error('not implemented'));
  }
}

export interface RSocketMachine<D, M> extends ReactiveSocket<D, M> {
  setRequestHandler(requestHandler: ?PartialResponder<D, M>): void,
}

export function createServerMachine<D, M>(
  connection: DuplexConnection,
  connectionPublisher: (partialSubscriber: IPartialSubscriber<Frame>) => void,
  serializers?: ?PayloadSerializers<D, M>,
  requestHandler?: ?PartialResponder<D, M>,
): RSocketMachine<D, M> {
  return new RSocketMachineImpl(
    'SERVER',
    connection,
    connectionPublisher,
    serializers,
    requestHandler,
  );
}

export function createClientMachine<D, M>(
  connection: DuplexConnection,
  connectionPublisher: (partialSubscriber: IPartialSubscriber<Frame>) => void,
  serializers?: ?PayloadSerializers<D, M>,
  requestHandler?: ?PartialResponder<D, M>,
): RSocketMachine<D, M> {
  return new RSocketMachineImpl(
    'CLIENT',
    connection,
    connectionPublisher,
    serializers,
    requestHandler,
  );
}

class RSocketMachineImpl<D, M> implements RSocketMachine<D, M> {
  _requestHandler: ResponderWrapper<D, M>;
  _connection: DuplexConnection;
  _nextStreamId: number;
  _receivers: Map<number, ISubject<Payload<D, M>>>;
  _subscriptions: Map<number, ISubscription>;
  _serializers: PayloadSerializers<D, M>;

  constructor(
    role: Role,
    connection: DuplexConnection,
    connectionPublisher: (partialSubscriber: IPartialSubscriber<Frame>) => void,
    serializers: ?PayloadSerializers<D, M>,
    requestHandler: ?PartialResponder<D, M>,
  ) {
    this._connection = connection;
    this._nextStreamId = role === 'CLIENT' ? 1 : 2;
    this._receivers = new Map();
    this._subscriptions = new Map();
    this._serializers = serializers || (IdentitySerializers: any);
    this._requestHandler = new ResponderWrapper(requestHandler);

    // Subscribe to completion/errors before sending anything
    connectionPublisher({
      onComplete: this._handleTransportClose,
      onError: this._handleError,
      onNext: this._handleFrame,
      onSubscribe: subscription =>
        subscription.request(Number.MAX_SAFE_INTEGER),
    });

    // Cleanup when the connection closes
    this._connection.connectionStatus().subscribe({
      onNext: status => {
        if (status.kind === 'CLOSED') {
          this._handleTransportClose();
        } else if (status.kind === 'ERROR') {
          this._handleError(status.error);
        }
      },
      onSubscribe: subscription =>
        subscription.request(Number.MAX_SAFE_INTEGER),
    });
  }

  setRequestHandler(requestHandler: ?PartialResponder<D, M>): void {
    this._requestHandler.setResponder(requestHandler);
  }

  close(): void {
    this._connection.close();
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return this._connection.connectionStatus();
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
    const streamId = this._getNextStreamId();
    let payloadsSubscribed = false;
    return new Flowable(
      subscriber => {
        try {
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
                if (!payloadsSubscribed) {
                  payloadsSubscribed = true;
                  payloads.subscribe({
                    onComplete: () => {
                      this._sendStreamComplete(streamId);
                    },
                    onError: error => {
                      this._sendStreamError(streamId, error);
                    },
                    //Subscriber methods
                    onNext: payload => {
                      const data = this._serializers.data.serialize(
                        payload.data,
                      );
                      const metadata = this._serializers.metadata.serialize(
                        payload.metadata,
                      );
                      if (!initialized) {
                        initialized = true;
                        const requestChannelFrame = {
                          data,
                          flags: payload.metadata !== undefined
                            ? FLAGS.METADATA
                            : 0,
                          metadata,
                          requestN: n,
                          streamId,
                          type: FRAME_TYPES.REQUEST_CHANNEL,
                        };
                        this._connection.sendOne(requestChannelFrame);
                      } else {
                        const payloadFrame = {
                          data,
                          flags: FLAGS.NEXT |
                            (payload.metadata !== undefined
                              ? FLAGS.METADATA
                              : 0),
                          metadata,
                          streamId,
                          type: FRAME_TYPES.PAYLOAD,
                        };
                        this._connection.sendOne(payloadFrame);
                      }
                    },
                    onSubscribe: subscription => {
                      this._subscriptions.set(streamId, subscription);
                      subscription.request(1);
                    },
                  });
                } else {
                  warning(
                    false,
                    'RSocketClient: re-entrant call to request n before initial' +
                      ' channel established.',
                  );
                }
              }
            },
          });
        } catch (err) {
          console.warn(
            'Exception while subscribing to channel flowable:' + err,
          );
        }
      },
      MAX_REQUEST_N,
    );
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
  _handleTransportClose = (): void => {
    this._handleError(new Error('RSocket: The connection was closed.'));
  };

  /**
   * Handle the transport connection closing abnormally or a connection-level protocol error.
   */
  _handleError = (error: Error) => {
    // Error any open request streams
    this._receivers.forEach(receiver => {
      receiver.onError(error);
    });
    this._receivers.clear();
  };

  _handleConnectionError(error: Error): void {
    this._handleError(error);
    this._connection.close();
  }

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
            lastReceivedPosition: 0,
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
        // TODO #18064706: handle requests from server
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
        this._handleCancel(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_N:
        this._handleRequestN(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_FNF:
        this._handleFireAndForget(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_RESPONSE:
        this._handleRequestResponse(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_STREAM:
        this._handleRequestStream(streamId, frame);
        break;
      case FRAME_TYPES.REQUEST_CHANNEL:
        this._handleRequestChannel(streamId, frame);
        break;
      case FRAME_TYPES.ERROR:
        const error = createErrorFromFrame(frame);
        this._handleStreamError(streamId, error);
        break;
      case FRAME_TYPES.PAYLOAD:
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

  _handleCancel(streamId: number, frame: CancelFrame): void {
    const subscription = this._subscriptions.get(streamId);
    if (subscription) {
      subscription.cancel();
      this._subscriptions.delete(streamId);
    }
  }

  _handleRequestN(streamId: number, frame: RequestNFrame): void {
    const subscription = this._subscriptions.get(streamId);
    if (subscription) {
      subscription.request(frame.requestN);
    }
  }

  _handleFireAndForget(streamId: number, frame: RequestFnfFrame): void {
    const payload = this._deserializePayload(frame);
    this._requestHandler.fireAndForget(payload);
  }

  _handleRequestResponse(streamId: number, frame: RequestResponseFrame): void {
    const payload = this._deserializePayload(frame);
    this._requestHandler.requestResponse(payload).subscribe({
      onComplete: payload => {
        this._sendStreamPayload(streamId, payload, true);
      },
      onError: error => this._sendStreamError(streamId, error),
      onSubscribe: cancel => {
        const subscription = {
          cancel,
          request: emptyFunction,
        };
        this._subscriptions.set(streamId, subscription);
      },
    });
  }

  _handleRequestStream(streamId: number, frame: RequestStreamFrame): void {
    const payload = this._deserializePayload(frame);
    this._requestHandler.requestStream(payload).subscribe({
      onComplete: () => this._sendStreamComplete(streamId),
      onError: error => this._sendStreamError(streamId, error),
      onNext: payload => this._sendStreamPayload(streamId, payload),
      onSubscribe: subscription => {
        this._subscriptions.set(streamId, subscription);
        subscription.request(frame.requestN);
      },
    });
  }

  _handleRequestChannel(streamId: number, frame: RequestChannelFrame): void {
    const existingSubscription = this._subscriptions.get(streamId);
    if (existingSubscription) {
      //I think this scenario is that we're talking to ourselves. The current
      //state machine doesn't support this
      throw new Error(
        'requestChannel() cannot be called and served by the same RSocketMachine',
      );
    }

    const payloads = new Flowable(
      subscriber => {
        let firstRequest = true;

        subscriber.onSubscribe({
          cancel: () => {
            this._receivers.delete(streamId);
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
            if (firstRequest) {
              n--;
            }

            if (n > 0) {
              const requestNFrame = {
                flags: 0,
                requestN: n,
                streamId,
                type: FRAME_TYPES.REQUEST_N,
              };
              this._connection.sendOne(requestNFrame);
            }
            //critically, if n is 0 now, that's okay because we eagerly decremented it
            if (firstRequest && n >= 0) {
              firstRequest = false;
              //release the initial frame we received in frame form due to map operator
              subscriber.onNext(frame);
            }
          },
        });
      },
      MAX_REQUEST_N,
    );
    const framesToPayloads = new FlowableProcessor(payloads, frame =>
      this._deserializePayload(frame));
    this._receivers.set(streamId, framesToPayloads);

    this._requestHandler.requestChannel(framesToPayloads).subscribe({
      onComplete: () => this._sendStreamComplete(streamId),
      onError: error => this._sendStreamError(streamId, error),
      onNext: payload => this._sendStreamPayload(streamId, payload),
      onSubscribe: subscription => {
        this._subscriptions.set(streamId, subscription);
        subscription.request(frame.requestN);
      },
    });
  }

  _sendStreamComplete(streamId: number): void {
    this._subscriptions.delete(streamId);
    this._connection.sendOne({
      data: null,
      flags: FLAGS.COMPLETE,
      metadata: null,
      streamId,
      type: FRAME_TYPES.PAYLOAD,
    });
  }

  _sendStreamError(streamId: number, error: Error): void {
    this._subscriptions.delete(streamId);
    this._connection.sendOne({
      code: ERROR_CODES.APPLICATION_ERROR,
      flags: 0,
      message: error.message,
      streamId,
      type: FRAME_TYPES.ERROR,
    });
  }

  _sendStreamPayload(
    streamId: number,
    payload: Payload<D, M>,
    complete?: boolean = false,
  ): void {
    let flags = FLAGS.NEXT;
    if (complete) {
      // eslint-disable-next-line no-bitwise
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

  _deserializePayload(frame: FrameWithData): Payload<D, M> {
    return deserializePayload(this._serializers, frame);
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
