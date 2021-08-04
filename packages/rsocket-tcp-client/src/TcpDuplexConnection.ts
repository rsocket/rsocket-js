import net from "net";
import { Deferred } from "@rsocket/rsocket-core";
import {
  deserializeFrameWithLength,
  DuplexConnection,
  FlowControlledFrameHandler,
  Frame,
  serializeFrameWithLength,
} from "@rsocket/rsocket-core";

export class TcpDuplexConnection extends Deferred implements DuplexConnection {
  private handler: FlowControlledFrameHandler;
  private error: Error;

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

  private handleData(data: Buffer) {
    try {
      const frame = deserializeFrameWithLength(data);
      this.handler.handle(frame);
    } catch (error) {
      this.close(error);
    }
  }
}
