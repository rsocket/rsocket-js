/*
 * Copyright 2021-2022 the original author or authors.
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
 */

import {
  Closeable,
  Deferred,
  Demultiplexer,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  ServerTransport
} from 'rsocket-core';
import WebSocket, { Server } from 'ws';
import { WebsocketDuplexConnection } from './WebsocketDuplexConnection';

export type SocketFactory = (options: SocketOptions) => Server;

export type SocketOptions = {
  host?: string;
  port?: number;
};

export type ServerOptions = SocketOptions & {
  wsCreator?: SocketFactory;
  debug?: boolean;
};

const defaultFactory: SocketFactory = (options: SocketOptions) => {
  return new Server({
    host: options.host,
    port: options.port
  });
};

export class WebsocketServerTransport implements ServerTransport {
  private readonly host: string;
  private readonly port: number;
  private readonly factory: SocketFactory;

  constructor(options: ServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.factory = options.wsCreator ?? defaultFactory;
  }

  async bind(
    connectionAcceptor: (frame: Frame, connection: DuplexConnection) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<Closeable> {
    const websocketServer: Server = await this.connectServer();
    const serverCloseable = new ServerCloseable(websocketServer);

    const connectionListener = (websocket: WebSocket) => {
      websocket.binaryType = 'nodebuffer';
      const duplex = WebSocket.createWebSocketStream(websocket);
      WebsocketDuplexConnection.create(duplex, connectionAcceptor, multiplexerDemultiplexerFactory, websocket);
    };

    const closeListener = (error?: Error) => {
      serverCloseable.close(error);
    };

    websocketServer.addListener('connection', connectionListener);
    websocketServer.addListener('close', closeListener);
    websocketServer.addListener('error', closeListener);

    return serverCloseable;
  }

  private connectServer(): Promise<Server> {
    return new Promise((resolve, reject) => {
      const websocketServer = this.factory({
        host: this.host,
        port: this.port
      });

      const earlyCloseListener = (error?: Error) => {
        reject(error);
      };

      websocketServer.addListener('close', earlyCloseListener);
      websocketServer.addListener('error', earlyCloseListener);
      websocketServer.addListener('listening', () => resolve(websocketServer));
    });
  }
}

class ServerCloseable extends Deferred {
  constructor(private readonly server: Server) {
    super();
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.server.close();
    super.close();
  }
}
