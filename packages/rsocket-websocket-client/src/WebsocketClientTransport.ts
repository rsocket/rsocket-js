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
} from "@viglucciio/rsocket-core";
import { WebsocketDuplexConnection } from "./WebsocketDuplexConnection";

export type ClientOptions = {
  url: string;
  wsCreator?: (url: string) => WebSocket;
  debug?: boolean;
};

export class WebsocketClientTransport implements ClientTransport {
  private readonly url: string;
  private readonly factory: (url: string) => WebSocket;

  constructor(options: ClientOptions) {
    this.url = options.url;
    this.factory = options.wsCreator ?? ((url: string) => new WebSocket(url));
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      const websocket = this.factory(this.url);

      websocket.binaryType = "arraybuffer";

      const openListener = () => {
        websocket.removeEventListener("open", openListener);
        websocket.removeEventListener("error", errorListener);
        resolve(
          new WebsocketDuplexConnection(
            websocket,
            new Deserializer(),
            multiplexerDemultiplexerFactory
          )
        );
      };

      const errorListener = (ev: ErrorEvent) => {
        websocket.removeEventListener("open", openListener);
        websocket.removeEventListener("error", errorListener);
        reject(ev.error);
      };

      websocket.addEventListener("open", openListener);
      websocket.addEventListener("error", errorListener);
    });
  }
}
