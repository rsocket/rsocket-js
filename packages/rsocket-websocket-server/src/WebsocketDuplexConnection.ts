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
  deserializeFrame,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  serializeFrame,
} from "rsocket-core";
import { Duplex } from "stream";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound
{
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private websocketDuplex: Duplex,
    frame: Frame,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();

    websocketDuplex.on("close", this.handleClosed);
    websocketDuplex.on("error", this.handleError);
    websocketDuplex.on("data", this.handleMessage);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(
      frame,
      this
    );
  }

  get availability(): number {
    return this.websocketDuplex.destroyed ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.websocketDuplex.removeAllListeners();
    this.websocketDuplex.end();

    delete this.websocketDuplex;

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    //   if (__DEV__) {
    //     if (this._options.debug) {
    //       console.log(printFrame(frame));
    //     }
    //   }
    const buffer =
      /* this._options.lengthPrefixedFrames
          ? serializeFrameWithLength(frame, this._encoders)
          :*/ serializeFrame(frame);
    // if (!this._socket) {
    //   throw new Error(
    //     "RSocketWebSocketClient: Cannot send frame, not connected."
    //   );
    // }
    this.websocketDuplex.write(buffer);
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

  private handleMessage = (buffer: Buffer): void => {
    try {
      const frame =
        /* this._options.lengthPrefixedFrames
          ? deserializeFrameWithLength(buffer, this._encoders)
          :  */ deserializeFrame(buffer);
      // if (__DEV__) {
      //   if (this._options.debug) {
      //     console.log(printFrame(frame));
      //   }
      // }
      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };

  static create(
    socket: Duplex,
    connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): void {
    // TODO: timeout on no data?
    socket.once("data", async (buffer) => {
      const frame = deserializeFrame(buffer);
      const connection = new WebsocketDuplexConnection(
        socket,
        frame,
        multiplexerDemultiplexerFactory
      );
      if (connection.done) {
        return;
      }
      try {
        socket.pause();
        await connectionAcceptor(frame, connection);
        socket.resume();
      } catch (error) {
        connection.close(error);
      }
    });
  }
}
