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
} from "@rsocket/rsocket-core";
import net from "net";

export class TcpDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound {
  private error: Error;
  private remainingBuffer: Buffer = Buffer.from([]);

  readonly multiplexerDemultiplexer: Multiplexer &
    Demultiplexer &
    FrameHandler &
    Closeable;

  constructor(
    private socket: net.Socket,
    private connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound
    ) => Multiplexer & Demultiplexer & FrameHandler & Closeable
  ) {
    super();

    socket.on("close", this.handleClosed.bind(this));
    socket.on("error", this.handleError.bind(this));
    socket.once("data", this.handleFirst.bind(this));

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

    this.socket.removeListener("close", this.handleClosed.bind(this));
    this.socket.removeListener("error", this.handleError.bind(this));
    this.socket.removeListener("data", this.handleData.bind(this));

    this.socket.destroy(error);

    delete this.socket;

    this.multiplexerDemultiplexer.close(error);

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrameWithLength(frame);

    this.socket.write(buffer);
  }

  private handleClosed(hadError: boolean): void {
    const message = hadError
      ? `TcpDuplexConnection: ${this.error.message}`
      : "TcpDuplexConnection: Socket closed unexpectedly.";
    this.close(new Error(message));
  }

  private handleError(error: Error): void {
    this.error = error;
    this.close(error);
  }

  private async handleFirst(buffer: Buffer): Promise<void> {
    try {
      this.socket.pause();
      this.socket.on("data", this.handleData.bind(this));

      const [frame, offset] = deserializeFrames(buffer).next().value;
      await this.connectionAcceptor(frame, this);
      this.socket.resume();
      if (offset < buffer.length) {
        this.handleData(buffer.slice(offset, buffer.length));
      }
    } catch (error) {
      this.close(error);
    }
  }

  private handleData(chunks: Buffer): void {
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
  }
}
