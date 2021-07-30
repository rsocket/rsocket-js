import { Deferred } from "@rsocket/rsocket-core";
import {
  deserializeFrame,
  DuplexConnection,
  FlowControlledFrameHandler,
  Frame,
  serializeFrame,
} from "@rsocket/rsocket-types";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection {
  private handler: FlowControlledFrameHandler;

  constructor(private websocket: WebSocket) {
    super();

    websocket.addEventListener("close", this.handleClosed);
    websocket.addEventListener("error", this.handleError);
    websocket.addEventListener("message", this.handleMessage);
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
      super.close(error);
      return;
    }

    this.websocket.removeEventListener("close", this.handleClosed);
    this.websocket.removeEventListener("error", this.handleError);
    this.websocket.removeEventListener("message", this.handleMessage);

    this.websocket.close();

    delete this.websocket;

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
    this.websocket.send(buffer);
  }

  private handleClosed(e: CloseEvent): void {
    this.close(
      new Error(
        e.reason || "RSocketWebSocketClient: Socket closed unexpectedly."
      )
    );
  }

  private handleError(e: ErrorEvent): void {
    this.close(e.error);
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
