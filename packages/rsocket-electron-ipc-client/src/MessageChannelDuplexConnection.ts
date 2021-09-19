import {
  Closeable,
  Deferred,
  Demultiplexer,
  deserializeFrame,
  Deserializer,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  serializeFrame,
} from "@rsocket/rsocket-core";

export class MessageChannelDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound {
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;

  constructor(
    private port: MessagePort,
    private deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();
    this.port.onmessage = (event) => {
      this.handleMessage(event);
    };
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

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrame(frame);

    this.port.postMessage(buffer);
  }

  private handleClosed = (e: CloseEvent): void => {
    this.close(
      new Error(e.reason || "ElectronIpcDuplexConnection: closed unexpectedly.")
    );
  };

  private handleError = (e: ErrorEvent): void => {
    this.close(e.error);
  };

  private handleMessage(event: MessageEvent) {
    const buffer = Buffer.from(event.data);
    this.handleData(buffer);
  }

  private handleData = (buffer: Buffer): void => {
    try {
      // Combine partial frame data from previous chunks with the next chunk,
      // then extract any complete frames plus any remaining data.
      const frame = this.deserializer.deserializeFrame(buffer);
      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
