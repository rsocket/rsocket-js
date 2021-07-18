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

import type {ConnectionStatus, DuplexConnection, Frame} from 'rsocket-types';
import type {ISubject, ISubscriber, ISubscription} from 'rsocket-types';
import type {Encoders} from 'rsocket-core';

import net from 'net';
import tls from 'tls';
import {Flowable} from 'rsocket-flowable';
import {
  createBuffer,
  deserializeFrames,
  serializeFrameWithLength,
} from 'rsocket-core';
import {CONNECTION_STATUS} from 'rsocket-types';

/**
 * A TCP transport client for use in node environments.
 */
export class RSocketTcpConnection implements DuplexConnection {
  _buffer: Buffer;
  _encoders: ?Encoders<*>;
  _receivers: Set<ISubscriber<Frame>>;
  _senders: Set<ISubscription>;
  _socket: ?net$Socket;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(socket: ?net$Socket, encoders: ?Encoders<*>) {
    this._buffer = createBuffer(0);
    this._encoders = encoders;
    this._receivers = new Set();
    this._senders = new Set();
    this._statusSubscribers = new Set();

    if (socket) {
      this.setupSocket(socket);
      this._status = CONNECTION_STATUS.CONNECTED;
    } else {
      this._socket = null;
      this._status = CONNECTION_STATUS.NOT_CONNECTED;
    }
  }

  close(): void {
    this._close();
  }

  connect(): void {
    throw new Error('not supported');
  }

  setupSocket(socket: net$Socket) {
    this._socket = socket;
    socket.on('close', this._handleError);
    socket.on('end', this._handleError);
    socket.on('error', this._handleError);
    socket.on('data', this._handleData);
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
    return new Flowable(subject => {
      subject.onSubscribe({
        cancel: () => {
          this._receivers.delete(subject);
        },
        request: () => {
          this._receivers.add(subject);
        },
      });
    });
  }

  sendOne(frame: Frame): void {
    this._writeFrame(frame);
  }

  send(frames: Flowable<Frame>): void {
    let subscription;
    frames.subscribe({
      onComplete: () => {
        subscription && this._senders.delete(subscription);
      },
      onError: error => {
        subscription && this._senders.delete(subscription);
        this._handleError(error);
      },
      onNext: frame => this._writeFrame(frame),
      onSubscribe: _subscription => {
        subscription = _subscription;
        this._senders.add(subscription);
        subscription.request(Number.MAX_SAFE_INTEGER);
      },
    });
  }

  getConnectionState(): ConnectionStatus {
    return this._status;
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this._status = status;
    this._statusSubscribers.forEach(subscriber => subscriber.onNext(status));
  }

  _close(error?: Error) {
    if (this._status.kind === 'CLOSED' || this._status.kind === 'ERROR') {
      // already closed
      return;
    }
    const status = error ? {error, kind: 'ERROR'} : CONNECTION_STATUS.CLOSED;
    this.setConnectionStatus(status);
    this._receivers.forEach(subscriber => {
      if (error) {
        subscriber.onError(error);
      } else {
        subscriber.onComplete();
      }
    });
    this._receivers.clear();
    this._senders.forEach(subscription => subscription.cancel());
    this._senders.clear();
    const socket = this._socket;
    if (socket) {
      socket.removeAllListeners();
      socket.end();
      this._socket = null;
    }
  }

  _handleError = (error?: ?Error): void => {
    error = error || new Error('RSocketTcpClient: Socket closed unexpectedly.');
    this._close(error);
  };

  _handleData = (chunk: Buffer): void => {
    try {
      const frames = this._readFrames(chunk);
      frames.forEach(frame => {
        this._receivers.forEach(subscriber => subscriber.onNext(frame));
      });
    } catch (error) {
      this._handleError(error);
    }
  };

  _readFrames(chunk: Buffer): Array<Frame> {
    // Combine partial frame data from previous chunks with the next chunk,
    // then extract any complete frames plus any remaining data.
    const buffer = Buffer.concat([this._buffer, chunk]);
    const [frames, remaining] = deserializeFrames(buffer, this._encoders);
    this._buffer = remaining;
    return frames;
  }

  _writeFrame(frame: Frame): void {
    try {
      const buffer = serializeFrameWithLength(frame, this._encoders);
      if (!this._socket) {
        throw new Error('RSocketTcpClient: Cannot send frame, not connected.');
      }
      this._socket.write(buffer);
    } catch (error) {
      this._handleError(error);
    }
  }
}

/**
 * A TCP transport client for use in node environments.
 */
export class RSocketTcpClient extends RSocketTcpConnection {
  _options: net$connectOptions;

  constructor(options: net$connectOptions, encoders: ?Encoders<*>) {
    super(null, encoders);
    this._options = options;
  }

  connect(): void {
    if (this.getConnectionState().kind !== 'NOT_CONNECTED') {
      throw new Error(
        'RSocketTcpClient: Cannot connect(), a connection is already established.',
      );
    }
    this.setConnectionStatus(CONNECTION_STATUS.CONNECTING);
    const socket = net.connect(this._options);

    this.setupSocket(socket);
    socket.on('connect', this._handleOpened);
  }

  _handleOpened = (): void => {
    this.setConnectionStatus(CONNECTION_STATUS.CONNECTED);
  };
}

/**
 * A TLS transport client for use in node environments.
 */
export class RSocketTlsClient extends RSocketTcpConnection {
  _options: tls$connectOptions;

  constructor(options: tls$connectOptions, encoders: ?Encoders<*>) {
    super(null, encoders);
    this._options = options;
  }

  connect(): void {
    if (this.getConnectionState().kind !== 'NOT_CONNECTED') {
      throw new Error(
        'RSocketTcpClient: Cannot connect(), a connection is already established.',
      );
    }
    this.setConnectionStatus(CONNECTION_STATUS.CONNECTING);
    const socket = tls.connect(this._options);

    this.setupSocket(socket);
    socket.on('connect', this._handleOpened);
  }

  _handleOpened = (): void => {
    this.setConnectionStatus(CONNECTION_STATUS.CONNECTED);
  };
}
