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

import type {connect as SocketOptions} from 'net';
import type {
  ConnectionStatus,
  DuplexConnection,
  Frame,
} from '../../ReactiveSocketTypes';
import type {
  ISubject,
  ISubscriber,
  ISubscription,
} from '../../ReactiveStreamTypes';
import type {Encoders} from 'rsocket-core';

import net from 'net';
import {Flowable} from 'rsocket-flowable';
import invariant from 'fbjs/lib/invariant';
import Deferred from 'fbjs/lib/Deferred';
import {
  createBuffer,
  deserializeFrames,
  printFrame,
  serializeFrameWithLength,
} from 'rsocket-core';
import {CONNECTION_STATUS} from '../../ReactiveSocketTypes';

/**
 * A TCP transport client for use in node environments.
 */
export default class RSocketTcpClient implements DuplexConnection {
  _buffer: Buffer;
  _closeDeferred: Deferred<void, Error>;
  _encoders: ?Encoders<*>;
  _options: SocketOptions;
  _receivers: Set<ISubscriber<Frame>>;
  _senders: Set<ISubscription>;
  _socket: ?net.Socket;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(options: SocketOptions, encoders: ?Encoders<*>) {
    this._buffer = createBuffer(0);
    this._closeDeferred = new Deferred();
    this._encoders = encoders;
    this._options = options;
    this._receivers = new Set();
    this._senders = new Set();
    this._socket = null;
    this._status = CONNECTION_STATUS.NOT_CONNECTED;
    this._statusSubscribers = new Set();
  }

  close(): void {
    this._close();
  }

  connect(): void {
    invariant(
      this._status.kind === 'NOT_CONNECTED',
      'RSocketTcpClient: Cannot connect(), a connection is already ' +
        'established.',
    );
    this._setConnectionStatus(CONNECTION_STATUS.CONNECTING);
    const socket = (this._socket = net.connect(this._options));

    socket.on('close', this._handleError);
    socket.on('connect', this._handleOpened);
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

  onClose(): Promise<void> {
    return this._closeDeferred.getPromise();
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

  _close(error?: Error) {
    if (this._status.kind === 'CLOSED' || this._status.kind === 'ERROR') {
      // already closed
      return;
    }
    const status = error ? {error, kind: 'ERROR'} : CONNECTION_STATUS.CLOSED;
    this._setConnectionStatus(status);
    if (error) {
      this._closeDeferred.reject(error);
    } else {
      this._closeDeferred.resolve();
    }
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

  _setConnectionStatus(status: ConnectionStatus): void {
    this._status = status;
    this._statusSubscribers.forEach(subscriber => subscriber.onNext(status));
  }

  _handleError = (error?: ?Error): void => {
    error = error || new Error('RSocketTcpClient: Socket closed unexpectedly.');
    this._close(error);
  };

  _handleOpened = (): void => {
    this._setConnectionStatus(CONNECTION_STATUS.CONNECTED);
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
      if (__DEV__) {
        if (this._options.debug) {
          console.log(printFrame(frame));
        }
      }
      const buffer = serializeFrameWithLength(frame, this._encoders);
      invariant(
        this._socket,
        'RSocketTcpClient: Cannot send frame, not connected.',
      );
      this._socket.write(buffer);
    } catch (error) {
      this._handleError(error);
    }
  }
}
