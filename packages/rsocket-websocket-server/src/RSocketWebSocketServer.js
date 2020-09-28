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
  ISubject,
  ConnectionStatus,
  DuplexConnection,
  Frame,
} from 'rsocket-types';
import type {Encoders, TransportServer} from 'rsocket-core';

import EventEmitter from 'events';
import ws from 'ws';
import invariant from 'fbjs/lib/invariant';
import {Flowable} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import {deserializeFrame, serializeFrame} from 'rsocket-core';
import {CONNECTION_STATUS} from 'rsocket-types';

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

export type WebsocketServerFactory = (
  options: ServerOptions,
) => typeof ws.Server;

/**
 * A WebSocket transport server.
 */
export default class RSocketWebSocketServer implements TransportServer {
  _emitter: EventEmitter;
  _encoders: ?Encoders<*>;
  _options: ServerOptions;
  _factory: WebsocketServerFactory = (options: ServerOptions) =>
    new ws.Server(options);

  constructor(
    options: ServerOptions,
    encoders?: ?Encoders<*>,
    factory?: WebsocketServerFactory,
  ) {
    this._emitter = new EventEmitter();
    this._encoders = encoders;
    this._options = options;
    if (factory) {
      this._factory = factory;
    }
  }

  start(): Flowable<DuplexConnection> {
    return new Flowable(subscriber => {
      let server: typeof ws.Server;
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
            server = this._factory(this._options);
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
  _socket: typeof ws.Socket;
  _receiver: Flowable<Frame>;
  _status: ConnectionStatus;
  _statusSubscribers: Set<ISubject<ConnectionStatus>>;

  constructor(socket: typeof ws.Socket, encoders: ?Encoders<*>) {
    this._active = true;
    this._close = new Deferred();
    this._encoders = encoders;
    this._socket = socket;
    this._statusSubscribers = new Set();

    if (socket) {
      this._status = CONNECTION_STATUS.CONNECTED;
    } else {
      this._status = CONNECTION_STATUS.NOT_CONNECTED;
    }

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

  _setConnectionStatus(status: ConnectionStatus): void {
    this._status = status;
    this._statusSubscribers.forEach(subscriber => subscriber.onNext(status));
  }
}
