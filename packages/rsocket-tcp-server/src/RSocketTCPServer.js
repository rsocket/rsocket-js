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

import type {DuplexConnection} from 'rsocket-types';
import type {Encoders, TransportServer} from 'rsocket-core';
import {RSocketTcpConnection} from 'rsocket-tcp-client';

import EventEmitter from 'events';
import net from 'net';
import {Flowable} from 'rsocket-flowable';

export type ServerOptions = {|
  host?: string,
  port: number,
  serverFactory?: (onConnect: (socket: net.Socket) => void) => net.Server,
|};

/**
 * A TCP transport server.
 */
export default class RSocketTCPServer implements TransportServer {
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
      let server: ?net.Server;
      const onClose = () => {
        if (server) {
          server.close();
        }
        subscriber.onComplete();
      };
      const onError = error => subscriber.onError(error);
      const onConnection = (socket: net.Socket) => {
        subscriber.onNext(new RSocketTcpConnection(socket, this._encoders));
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
            const factory = this._options.serverFactory || net.createServer;
            server = factory(onConnection);
            server.listen(this._options.port, this._options.host);
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
