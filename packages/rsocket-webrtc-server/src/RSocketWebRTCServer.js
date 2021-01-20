/**
 * Copyright 2015-present the original author or authors.
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
  ISubject,
  ConnectionStatus,
  DuplexConnection,
  Frame,
} from 'rsocket-types';
import type {Encoders, TransportServer} from 'rsocket-core';

import EventEmitter from 'events';
import invariant from 'fbjs/lib/invariant';
import {Flowable} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import {deserializeFrame, deserializeFrameWithLength, printFrame, serializeFrame, toBuffer} from 'rsocket-core';
import {CONNECTION_STATUS} from 'rsocket-types';

export type ServerOptions = {|
  rtcDataChannelProvider: Flowable<RTCDataChannel>
|};
/**
 * A WebRTC Transport server.
 */
export default class RSocketWebRTCServer implements TransportServer {
  _emitter: EventEmitter;
  _encoders: ?Encoders<*>;
  _options: ServerOptions;
  _rtcDataChannelProvider: Flowable<RTCDataChannel>;

  constructor(
    options: ServerOptions,
    encoders?: ?Encoders<*>,
  ) {
    this._emitter = new EventEmitter();
    this._encoders = encoders;
    this._options = options;
    this._rtcDataChannelProvider = options.rtcDataChannelProvider;
  }

  start(): Flowable<DuplexConnection> {
    return this._rtcDataChannelProvider.map(dataChannel => new WebRTCDuplexConnection(dataChannel, this._encoders));
  }

  stop(): void {
    this._emitter.emit('close');
  }
}

/**
 * @private
 */
class WebRTCDuplexConnection implements DuplexConnection {
  _active: boolean;
  _close: Deferred<void, Error>;
  _encoders: ?Encoders<*>;
  _channel: RTCDataChannel;
  _receiver: Flowable<Frame>;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(channel: RTCDataChannel, encoders: ?Encoders<*>) {
    this._active = true;
    this._close = new Deferred();
    this._encoders = encoders;
    this._channel = channel;
    this._statusSubscribers = new Set();

    if (channel) {
      this._status = CONNECTION_STATUS.CONNECTED;
    } else {
      this._status = CONNECTION_STATUS.NOT_CONNECTED;
    }

    channel.binaryType = 'arraybuffer';

    // If _receiver has been `subscribe()`-ed already
    let isSubscribed = false;
    this._receiver = new Flowable(subscriber => {
      invariant(
        !isSubscribed,
        'RSocketWebSocketServer: Multicast receive() is not supported. Be sure ' +
          'to receive/subscribe only once.',
      );
      isSubscribed = true;

      // Whether `request()` has been called.
      let initialized = false;
      const closeSocket = () => {
        if (!initialized) {
          return;
        }

        (this._channel.removeEventListener: $FlowIssue)('close', onSocketClosed);
        (this._channel.removeEventListener: $FlowIssue)('error', onSocketError);
        (this._channel.removeEventListener: $FlowIssue)('message', onMessage);

        this._channel.close();
      };
      const onSocketClosed = () => {
        closeSocket();
        subscriber.onError(
          new Error('RSocketWebSocketServer: Socket closed unexpectedly.'),
        );
        this._setConnectionStatus(CONNECTION_STATUS.CLOSED);
      };
      const onSocketError = error => {
        closeSocket();
        subscriber.onError(error);
        const status = error
          ? {error, kind: 'ERROR'}
          : CONNECTION_STATUS.CLOSED;
        this._setConnectionStatus(status);
      };
      const onMessage = (data: MessageEvent) => {
        try {
          const frame = this._readFrame(data);
          subscriber.onNext(frame);
        } catch (error) {
          closeSocket();
          subscriber.onError(error);
        }
      };

      subscriber.onSubscribe({
        cancel: closeSocket,
        request: () => {
          if (initialized) {
            return;
          }
          initialized = true;
          (this._channel.addEventListener: $FlowIssue)('close', onSocketClosed);
          (this._channel.addEventListener: $FlowIssue)('error', onSocketError);
          (this._channel.addEventListener: $FlowIssue)('message', onMessage);
        },
      });
    });
  }

  connect(): void {
    throw new Error('not supported');
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: () => {
          this._statusSubscribers.delete(subscriber);
        },
        request: () => {
          this._statusSubscribers.add(subscriber);
          subscriber.onNext(this._status);
        },
      });
    });
  }

  receive(): Flowable<Frame> {
    return this._receiver;
  }

  sendOne(frame: Frame): void {
    this._writeFrame(frame);
  }

  send(frames: Flowable<Frame>): void {
    frames.subscribe({
      onError: error => this._handleError(error),
      onNext: frame => this._writeFrame(frame),
      onSubscribe(subscription) {
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  close(): void {
    // this._channel.emit('close');
    this._channel.close();
  }

  _readFrame(message: MessageEvent): Frame {
    const buffer = toBuffer(message.data);
    return deserializeFrame(buffer, this._encoders);
  }

  _writeFrame(frame: Frame): void {
    try {
      const buffer = serializeFrame(frame, this._encoders);
      this._channel.send(buffer);
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error: Error): void {
    // this._channel.emit('error', error);
  }

  _setConnectionStatus(status: ConnectionStatus): void {
    this._status = status;
    this._statusSubscribers.forEach(subscriber => subscriber.onNext(status));
  }
}
