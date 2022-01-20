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
  Deserializer,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  serializeFrame,
} from "@rsocket/core";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound
{
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private websocket: WebSocket,
    private deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();

    websocket.addEventListener("close", this.handleClosed);
    websocket.addEventListener("error", this.handleError);
    websocket.addEventListener("message", this.handleMessage);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(this);
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.websocket.removeEventListener("close", this.handleClosed);
    this.websocket.removeEventListener("error", this.handleError);
    this.websocket.removeEventListener("message", this.handleMessage);

    this.websocket.close();

    delete this.websocket;

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrame(frame);

    this.websocket.send(buffer);
  }

  private handleClosed = (e: CloseEvent): void => {
    this.close(
      new Error(
        e.reason || "WebsocketDuplexConnection: Socket closed unexpectedly."
      )
    );
  };

  private handleError = (e: ErrorEvent): void => {
    this.close(e.error);
  };

  private handleMessage = (message: MessageEvent): void => {
    try {
      const buffer = Buffer.from(message.data);
      const frame = this.deserializer.deserializeFrame(buffer);

      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
