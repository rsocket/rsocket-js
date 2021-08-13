import {
  Deferred,
  deserializeFrames,
  DuplexConnection,
  FlowControl,
  FlowControlledFrameHandler,
  Frame,
  serializeFrameWithLength,
} from "@rsocket/rsocket-core";
import net from "net";

export class TcpDuplexConnection extends Deferred implements DuplexConnection {
  private handler: FlowControlledFrameHandler;
  private error: Error;
  private remainingBuffer: Buffer = Buffer.from([]);

  private state = FlowControl.NEXT;
  private readonly resolver = (controlAction: FlowControl) => {
    if (this.state === undefined) {
      this.state = controlAction;
      if (this.socket.isPaused()) {
        this.socket.resume();

        if (this.remainingBuffer.byteLength > 0) {
          this.handleData(Buffer.from([]));
        }
      }
    }
  };

  constructor(private socket: net.Socket) {
    super();

    socket.on("close", this.handleClosed.bind(this));
    socket.on("error", this.handleError.bind(this));
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

    this.socket.removeListener("close", this.handleClosed.bind(this));
    this.socket.removeListener("error", this.handleError.bind(this));
    this.socket.removeListener("message", this.handleData.bind(this));

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

  private handleData(chunks: Buffer) {
    try {
      // Combine partial frame data from previous chunks with the next chunk,
      // then extract any complete frames plus any remaining data.
      const buffer = Buffer.concat([this.remainingBuffer, chunks]);
      let lastOffset = 0;
      if (this.state === FlowControl.ALL) {
        for (const [frame, offset] of deserializeFrames(buffer)) {
          lastOffset = offset;
          this.handler.handle(frame);
        }
      } else {
        outer: for (const [frame, offset] of deserializeFrames(buffer)) {
          lastOffset = offset;
          switch (this.state) {
            case FlowControl.NEXT: {
              this.state = undefined;
              this.handler.handle(frame, this.resolver);
              if (this.state === undefined) {
                this.socket.pause();
                break outer;
              }
              break;
            }
            case FlowControl.ALL: {
              this.handler.handle(frame);
              break;
            }
          }
        }
      }
      this.remainingBuffer = buffer.slice(lastOffset, buffer.length);
    } catch (error) {
      this.close(error);
    }
  }
}
