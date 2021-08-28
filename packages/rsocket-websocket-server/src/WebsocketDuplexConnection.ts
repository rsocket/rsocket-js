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
} from "@rsocket/rsocket-core";
import { Duplex } from "stream";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound {
  readonly multiplexerDemultiplexer: Multiplexer &
    Demultiplexer &
    FrameHandler &
    Closeable;

  constructor(
    private websocketDuplex: Duplex,
    private connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound
    ) => Multiplexer & Demultiplexer & FrameHandler & Closeable
  ) {
    super();

    websocketDuplex.on("close", this.handleClosed.bind(this));
    websocketDuplex.on("error", this.handleError.bind(this));
    websocketDuplex.once("data", this.handleFirst.bind(this));

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(this);
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

    this.multiplexerDemultiplexer.close(error);

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
    const buffer = /* this._options.lengthPrefixedFrames
          ? serializeFrameWithLength(frame, this._encoders)
          :*/ serializeFrame(
      frame
    );
    // if (!this._socket) {
    //   throw new Error(
    //     "RSocketWebSocketClient: Cannot send frame, not connected."
    //   );
    // }
    this.websocketDuplex.write(buffer);
  }

  private handleClosed(e: CloseEvent): void {
    this.close(
      new Error(
        e.reason || "WebsocketDuplexConnection: Socket closed unexpectedly."
      )
    );
  }

  private handleError(e: ErrorEvent): void {
    this.close(e.error);
  }

  private async handleFirst(buffer: Buffer): Promise<void> {
    try {
      this.websocketDuplex.pause();
      this.websocketDuplex.on("data", this.handleMessage.bind(this));
      const frame = /* this._options.lengthPrefixedFrames
          ? deserializeFrameWithLength(buffer, this._encoders)
          :  */ deserializeFrame(
        buffer
      );
      await this.connectionAcceptor(frame, this);
      this.websocketDuplex.resume();
    } catch (error) {
      this.close(error);
    }
  }

  private handleMessage(buffer: Buffer): void {
    try {
      const frame = /* this._options.lengthPrefixedFrames
          ? deserializeFrameWithLength(buffer, this._encoders)
          :  */ deserializeFrame(
        buffer
      );
      // if (__DEV__) {
      //   if (this._options.debug) {
      //     console.log(printFrame(frame));
      //   }
      // }
      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  }
}
