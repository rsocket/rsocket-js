import {
  Deferred,
  Deserializer,
  DuplexConnection,
  FlowControlledFrameHandler,
  Frame,
  serializeFrame,
} from "@rsocket/rsocket-core";
import WebSocket, { ErrorEvent, CloseEvent } from "ws";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection {
  private handler: FlowControlledFrameHandler;

  constructor(
    private websocket: WebSocket,
    private deserializer: Deserializer
  ) {
    super();

    websocket.addEventListener("close", this.handleClosed.bind(this));
    websocket.addEventListener("error", this.handleError.bind(this));
    websocket.addEventListener("message", this.handleMessage.bind(this));
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

    this.websocket.removeEventListener("close", this.handleClosed.bind(this));
    this.websocket.removeEventListener("error", this.handleError.bind(this));
    this.websocket.removeEventListener(
      "message",
      this.handleMessage.bind(this)
    );

    this.websocket.close();

    delete this.websocket;

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrame(frame);

    this.websocket.send(buffer);
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

  private handleMessage = (message: MessageEvent): void => {
    try {
      const buffer = Buffer.from(message.data);
      const frame = this.deserializer.deserializeFrame(buffer);

      this.handler.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
