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

import type {DuplexConnection, Frame} from '../../ReactiveSocketTypes';
import type {ISubscriber, ISubscription} from '../../ReactiveStreamTypes';
import type {Encoders, TransportClient} from 'rsocket-core';

import sprintf from 'fbjs/lib/sprintf';
import {Single, Flowable} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import {
  deserializeFrame,
  deserializeFrameWithLength,
  printFrame,
  serializeFrame,
  serializeFrameWithLength,
  toBuffer,
} from 'rsocket-core';

export type ClientOptions = {|
  url: string,
  debug?: boolean,
  lengthPrefixedFrames?: boolean,
|};

/**
 * A WebSocket transport client for use in browser environments.
 */
export default class RSocketWebSocketClient implements TransportClient {
  _encoders: ?Encoders<*>;
  _options: ClientOptions;

  constructor(options: ClientOptions, encoders?: ?Encoders<*>) {
    this._encoders = encoders;
    this._options = options;
  }

  connect(): Single<DuplexConnection> {
    return new Single(subscriber => {
      const socket = new WebSocket(this._options.url);
      socket.binaryType = 'arraybuffer';

      const removeListeners = () => {
        (socket.removeEventListener: $FlowIssue)('close', onSocketClosed);
        (socket.removeEventListener: $FlowIssue)('error', onSocketClosed);
        (socket.removeEventListener: $FlowIssue)('open', onOpen);
      };
      const onSocketClosed = () => {
        removeListeners();
        subscriber.onError(
          new Error(
            sprintf(
              'RSocketWebSocketClient: Failed to open connection to %s.',
              this._options.url,
            ),
          ),
        );
      };
      const onOpen = () => {
        removeListeners();
        subscriber.onComplete(
          new WSDuplexConnection(this._options, socket, this._encoders),
        );
      };

      subscriber.onSubscribe(() => {
        removeListeners();
        socket.close();
      });
      (socket.addEventListener: $FlowIssue)('close', onSocketClosed);
      (socket.addEventListener: $FlowIssue)('error', onSocketClosed);
      (socket.addEventListener: $FlowIssue)('open', onOpen);
    });
  }
}

/**
 * @private
 */
class WSDuplexConnection implements DuplexConnection {
  _active: boolean;
  _close: Deferred<void, Error>;
  _encoders: ?Encoders<*>;
  _options: ClientOptions;
  _receivers: Set<ISubscriber<Frame>>;
  _senders: Set<ISubscription>;
  _socket: WebSocket;

  constructor(
    options: ClientOptions,
    socket: WebSocket,
    encoders: ?Encoders<*>,
  ) {
    this._active = true;
    this._close = new Deferred();
    this._encoders = encoders;
    this._options = options;
    this._receivers = new Set();
    this._senders = new Set();
    this._socket = socket;

    (this._socket.addEventListener: $FlowIssue)('close', this._handleClosed);
    (this._socket.addEventListener: $FlowIssue)('error', this._handleClosed);
    (this._socket.addEventListener: $FlowIssue)('message', this._handleMessage);
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

  close = () => {
    if (!this._active) {
      return;
    }
    this._active = false;
    this._close.resolve();
    this._receivers.forEach(subscriber => subscriber.onComplete());
    this._receivers.clear();
    this._senders.forEach(subscription => subscription.cancel());
    this._senders.clear();
    (this._socket.removeEventListener: $FlowIssue)('close', this._handleClosed);
    (this._socket.removeEventListener: $FlowIssue)('error', this._handleClosed);
    (this._socket.removeEventListener: $FlowIssue)(
      'message',
      this._handleMessage,
    );
    this._socket.close();
  };

  onClose(): Promise<void> {
    return this._close.getPromise();
  }

  _handleClosed = (): void => {
    this._handleError(
      new Error('RSocketWebSocketClient: Socket closed unexpectedly.'),
    );
  };

  _handleError = (error: Error): void => {
    this._receivers.forEach(subscriber => subscriber.onError(error));
    this.close();
  };

  _handleMessage = (message: MessageEvent): void => {
    try {
      const frame = this._readFrame(message);
      this._receivers.forEach(subscriber => subscriber.onNext(frame));
    } catch (error) {
      this._handleError(error);
    }
  };

  _readFrame(message: MessageEvent): Frame {
    const buffer = toBuffer(message.data);
    const frame = this._options.lengthPrefixedFrames
      ? deserializeFrameWithLength(buffer, this._encoders)
      : deserializeFrame(buffer, this._encoders);
    if (__DEV__) {
      if (this._options.debug) {
        console.log(printFrame(frame));
      }
    }
    return frame;
  }

  _writeFrame(frame: Frame): void {
    try {
      if (__DEV__) {
        if (this._options.debug) {
          console.log(printFrame(frame));
        }
      }
      const buffer = this._options.lengthPrefixedFrames
        ? serializeFrameWithLength(frame, this._encoders)
        : serializeFrame(frame, this._encoders);
      this._socket.send(buffer);
    } catch (error) {
      this._handleError(error);
    }
  }
}
