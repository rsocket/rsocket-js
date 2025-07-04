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
  serializeFrame
} from 'rsocket-core';
import { Duplex } from 'stream';
import WebSocket from 'ws';

export class WebsocketDuplexConnection extends Deferred implements DuplexConnection, Outbound {
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private websocketDuplex: Duplex,
    frame: Frame,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler,
    private rawSocket: WebSocket.WebSocket
  ) {
    super();

    websocketDuplex.on('close', this.handleClosed);
    websocketDuplex.on('error', this.handleError);
    websocketDuplex.on('data', this.handleMessage);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(frame, this);
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

    try {
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

      // Work around for this issue
      // https://github.com/websockets/ws/issues/1515
      if (this.rawSocket.readyState == this.rawSocket.CLOSING || this.rawSocket.readyState == this.rawSocket.CLOSED) {
        this.close(new Error('WebSocket is closing'));
        return;
      }

      this.websocketDuplex.write(buffer);
    } catch (ex) {
      this.close(new Error(ex.reason || `Could not write to WebSocket duplex connection: ${ex}`));
    }
  }

  private handleClosed = (e: WebSocket.CloseEvent): void => {
    this.close(new Error(e.reason || 'WebsocketDuplexConnection: Socket closed unexpectedly.'));
  };

  private handleError = (e: WebSocket.ErrorEvent): void => {
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
    connectionAcceptor: (frame: Frame, connection: DuplexConnection) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler,
    rawSocket: WebSocket.WebSocket
  ): void {
    // TODO: timeout on no data?
    socket.once('data', async (buffer) => {
      let frame: Frame | undefined = undefined;
      try {
        frame = deserializeFrame(buffer);
        if (!frame) {
          throw new Error(`Unable to deserialize frame`);
        }
      } catch (ex) {
        // The initial frame should always be parsable
        return socket.end();
      }

      const connection = new WebsocketDuplexConnection(socket, frame, multiplexerDemultiplexerFactory, rawSocket);
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
