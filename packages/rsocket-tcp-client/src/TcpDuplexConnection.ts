import {
  Deferred,
  deserializeFrames,
  DuplexConnection,
  FlowControlledFrameHandler,
  Frame,
  serializeFrameWithLength,
} from "@rsocket/rsocket-core";
import net from "net";

export class TcpDuplexConnection extends Deferred implements DuplexConnection {
  private handler: FlowControlledFrameHandler;
  private error: Error;
  private remainingBuffer: Buffer = Buffer.from([]);

  constructor(private socket: net.Socket) {
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
  }

  handle(handler: FlowControlledFrameHandler): void {
    if (this.handler) {
      throw new Error("Handle has already been installed");
    }

    this.handler = handler;
  }

  get availability(): number {
    throw new Error("Method not implemented.");
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
      for (const [frame, offset] of deserializeFrames(buffer)) {
        lastOffset = offset;
        this.handler.handle(frame);
      }
      this.remainingBuffer = buffer.slice(lastOffset, buffer.length);
    } catch (error) {
      this.close(error);
    }
  }
}
