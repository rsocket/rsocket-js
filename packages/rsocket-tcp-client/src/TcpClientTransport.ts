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
  ClientTransport,
  Closeable,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  FrameHandler,
  Multiplexer,
  Outbound,
} from "rsocket-core";
import net, { SocketConnectOpts } from "net";
import { TcpDuplexConnection } from "./TcpDuplexConnection";

type TcpSocketCreator = (
  options: SocketConnectOpts,
  connectionListener?: () => void
) => net.Socket;

type TcpClientOptionsSocketFactory = (
  options: net.NetConnectOpts
) => net.Socket;

type TcpClientOptions = {
  connectionOptions: net.NetConnectOpts;
  socketCreator?: TcpClientOptionsSocketFactory;
};

export class TcpClientTransport implements ClientTransport {
  private readonly connectionOptions: net.NetConnectOpts;
  private readonly socketCreator: TcpSocketCreator;

  constructor(options: TcpClientOptions) {
    this.connectionOptions = options.connectionOptions;
    this.socketCreator =
      options.socketCreator ?? ((options) => net.connect(options));
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      const openListener = () => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        resolve(
          new TcpDuplexConnection(
            socket,
            new Deserializer(),
            multiplexerDemultiplexerFactory
          )
        );
      };

      const errorListener = (error: Error) => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        reject(error);
      };

      socket = this.socketCreator(this.connectionOptions);

      socket.once("connect", openListener);
      socket.once("error", errorListener);
      socket.once("close", errorListener);
      socket.once("end", errorListener);
    });
  }
}
