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
import type {Encoders, TransportServer} from 'rsocket-core';

import EventEmitter from 'events';
import ws from 'ws';
import invariant from 'fbjs/lib/invariant';
import {Flowable} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import {deserializeFrame, serializeFrame} from 'rsocket-core';

export type ServerOptions = {|
  host?: string,
  port: number,
  backlog?: number,
  server?: any,
  verifyClient?: Function,
  handleProtocols?: Function,
  path?: string,
  noServer?: boolean,
  clientTracking?: boolean,
  perMessageDeflate?: any,
  maxPayload?: number,
|};

/**
 * A WebSocket transport server.
 */
export default class RSocketWebSocketServer implements TransportServer {
  _emitter: EventEmitter;
  _encoders: ?Encoders<*>;
  _options: ServerOptions;

  constructor(options: ServerOptions, encoders?: ?Encoders<*>) {
    this._emitter = new EventEmitter();
    this._encoders = encoders;
    this._options = options;
  }

  start(): Flowable<DuplexConnection> {
    return new Flowable(subscriber => {
      let server: ws.Server;
      const onClose = () => {
        if (server) {
          server.stop();
        }
        subscriber.onComplete();
      };
      const onError = error => subscriber.onError(error);
      const onConnection = socket => {
        subscriber.onNext(new WSDuplexConnection(socket, this._encoders));
      };
      subscriber.onSubscribe({
        cancel: () => {
          if (!server) {
            return;
          }
          server.removeListener('connection', onConnection);
          server.removeListener('error', onError);
          this._emitter.removeListener('close', onClose);
          server.close();
          server = null;
        },
        request: n => {
          if (!server) {
            server = new ws.Server(this._options);
            server.on('connection', onConnection);
            server.on('error', onError);
            this._emitter.on('close', onClose);
          }
        },
      });
    });
  }

  stop(): void {
    this._emitter.emit('close');
  }
}

/**
 * @private
 */
class WSDuplexConnection implements DuplexConnection {
  _active: boolean;
  _close: Deferred<void, Error>;
  _encoders: ?Encoders<*>;
  _socket: ws.Socket;
  _receiver: Flowable<Frame>;

  constructor(socket: ws.Socket, encoders: ?Encoders<*>) {
    this._active = true;
    this._close = new Deferred();
    this._encoders = encoders;
    this._socket = socket;

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
        this._socket.removeListener('close', onSocketClosed);
        this._socket.removeListener('error', onSocketError);
        this._socket.removeListener('message', onMessage);
        this._socket.close();
      };
      const onSocketClosed = () => {
        closeSocket();
        subscriber.onError(
          new Error('RSocketWebSocketServer: Socket closed unexpectedly.'),
        );
      };
      const onSocketError = error => {
        closeSocket();
        subscriber.onError(error);
      };
      const onMessage = (data: Buffer) => {
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
          this._socket.on('close', onSocketClosed);
          this._socket.on('error', onSocketError);
          this._socket.on('message', onMessage);
        },
      });
    });
  }

  connect(): void {
    // TODO: Do we need this?
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: () => {},
        request: () => {},
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
    this._socket.emit('close');
    this._socket.close();
  }

  _readFrame(buffer: Buffer): Frame {
    return deserializeFrame(buffer, this._encoders);
  }

  _writeFrame(frame: Frame): void {
    try {
      const buffer = serializeFrame(frame, this._encoders);
      this._socket.send(buffer);
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error: Error): void {
    this._socket.emit('error', error);
  }
}
