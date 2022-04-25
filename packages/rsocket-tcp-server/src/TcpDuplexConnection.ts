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
  deserializeFrames,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  serializeFrameWithLength,
} from "rsocket-core";
import net from "net";

export class TcpDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound
{
  private error: Error;
  private remainingBuffer: Buffer = Buffer.allocUnsafe(0);

  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private socket: net.Socket,
    frame: Frame,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();

    socket.on("close", this.handleClosed);
    socket.on("error", this.handleError);
    socket.on("data", this.handleData);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(
      frame,
      this
    );
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.socket.off("close", this.handleClosed);
    this.socket.off("error", this.handleError);
    this.socket.off("data", this.handleData);

    // TODO: should this be destroy instead of end()?
    //   apparently client can still send data after calling end()
    //   and socket will never fully close until peer closes their end.
    //   ex: the above is a problem when connected to a .Net TCP socket
    this.socket.end();

    delete this.socket;

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrameWithLength(frame);

    this.socket.write(buffer);
  }

  private handleClosed = (hadError: boolean): void => {
    const message = hadError
      ? `TcpDuplexConnection: ${this.error.message}`
      : "TcpDuplexConnection: Socket closed unexpectedly.";
    this.close(new Error(message));
  };

  private handleError = (error: Error): void => {
    this.error = error;
    this.close(error);
  };

  private handleData = (chunks: Buffer): void => {
    try {
      // Combine partial frame data from previous chunks with the next chunk,
      // then extract any complete frames plus any remaining data.
      const buffer = Buffer.concat([this.remainingBuffer, chunks]);
      let lastOffset = 0;
      for (const [frame, offset] of deserializeFrames(buffer)) {
        lastOffset = offset;
        this.multiplexerDemultiplexer.handle(frame);
      }
      this.remainingBuffer = buffer.slice(lastOffset, buffer.length);
    } catch (error) {
      this.close(error);
    }
  };

  static create(
    socket: net.Socket,
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
      const [frame, offset] = deserializeFrames(buffer).next().value;
      const connection = new TcpDuplexConnection(
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
        if (offset < buffer.length) {
          connection.handleData(buffer.slice(offset, buffer.length));
        }
      } catch (error) {
        connection.close(error);
      }
    });
  }
}
