import net from "net";
import { Deferred } from "@rsocket/rsocket-core";
import {
  deserializeFrame,
  DuplexConnection,
  FlowControlledFrameHandler,
  Frame,
  serializeFrame,
} from "@rsocket/rsocket-types";

export class TcpDuplexConnection extends Deferred implements DuplexConnection {
  private handler: FlowControlledFrameHandler;
  private error: Error;

  constructor(private socket: net.Socket) {
    super();

    socket.on("close", this.handleClosed.bind(this));
    socket.on("error", this.handleError.bind(this));
    socket.on("data", this.handleMessage.bind(this));
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
    this.socket.removeListener("message", this.handleMessage.bind(this));

    this.socket.destroy(error);

    delete this.socket;

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
    // TODO: TCP transport must use frame length prefixed frames
    //  https://github.com/rsocket/rsocket/blob/master/Protocol.md#framing-protocol-usage
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

  private handleMessage = (message: MessageEvent): void => {
    try {
      const buffer = Buffer.from(message.data);
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
      this.handler.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
