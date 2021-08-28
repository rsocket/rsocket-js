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
    // dependency injected to facilitate testing
    private readonly deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound
    ) => Multiplexer & Demultiplexer & FrameHandler & Closeable
  ) {
    super();

    /**
     * Emitted when an error occurs. The 'close' event will be called directly following this event.
     */
    socket.on("error", this.handleError.bind(this));

    /**
     * Emitted once the socket is fully closed. The argument hadError is a boolean which says
     * if the socket was closed due to a transmission error.
     */
    socket.on("close", this.handleClosed.bind(this));

    /**
     * Emitted when data is received. The argument data will be a Buffer or String. Encoding of data is set by
     * socket.setEncoding(). The data will be lost if there is no listener when a Socket emits a 'data' event.
     */
    socket.on("data", this.handleData.bind(this));

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(this);
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      return;
    }

    this.socket.removeListener("error", this.handleError.bind(this));
    this.socket.removeListener("close", this.handleClosed.bind(this));
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

  /**
   * Handles close event from the underlying socket.
   * @param hadError
   * @private
   */
  private handleClosed(hadError: boolean): void {
    const message = hadError
      ? `TcpDuplexConnection: ${this.error.message}`
      : "TcpDuplexConnection: Socket closed unexpectedly.";
    this.close(new Error(message));
  }

  /**
   * Handles error events from the underlying socket. `handleClosed` is expected to be called
   * immediately following `handleError`.
   * @param error
   * @private
   */
  private handleError(error: Error): void {
    this.error = error;
  }

  private handleData(chunks: Buffer) {
    try {
      // Combine partial frame data from previous chunks with the next chunk,
      // then extract any complete frames plus any remaining data.
      const buffer = Buffer.concat([this.remainingBuffer, chunks]);
      let lastOffset = 0;
      const frames = this.deserializer.deserializeFrames(buffer);
      for (const [frame, offset] of frames) {
        lastOffset = offset;
        this.multiplexerDemultiplexer.handle(frame);
      }
      this.remainingBuffer = buffer.slice(lastOffset, buffer.length);
    } catch (error) {
      this.close(error);
    }
  }
}
