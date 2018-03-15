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

import type {ConnectionStatus, DuplexConnection, Frame} from 'rsocket-types';
import type {IPublisher} from 'rsocket-types';
import type {Encoders, TransportServer} from 'rsocket-core';
import {RSocketTcpConnection} from 'rsocket-tcp-client';

import EventEmitter from 'events';
import ws from 'ws';
import net from 'net';
import invariant from 'fbjs/lib/invariant';
import sprintf from 'fbjs/lib/sprintf';
import {Flowable} from 'rsocket-flowable';
import Deferred from 'fbjs/lib/Deferred';
import {deserializeFrame, serializeFrame, toBuffer} from 'rsocket-core';

export type ServerOptions = {|
  host?: string,
  port: number,
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
            server = net.createServer(onConnection);
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
