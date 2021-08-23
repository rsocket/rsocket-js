import {
  ClientServerInputMultiplexerDemultiplexer,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  Frame,
  Multiplexer,
  serializeFrame,
  StreamIdGenerator,
} from "@rsocket/rsocket-core";
import WebSocket, { CloseEvent, ErrorEvent } from "ws";

export class WebsocketDuplexConnection
  extends ClientServerInputMultiplexerDemultiplexer
  implements DuplexConnection {
  constructor(
    private websocket: WebSocket,
    private deserializer: Deserializer
  ) {
    super(StreamIdGenerator.create(-1));

    websocket.addEventListener("close", this.handleClosed.bind(this));
    websocket.addEventListener("error", this.handleError.bind(this));
    websocket.addEventListener("message", this.handleMessage.bind(this));
  }

  get multiplexer(): Multiplexer {
    return this;
  }

  get demultiplexer(): Demultiplexer {
    return this;
  }

  get availability(): number {
    return this.done ? 0 : 1;
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

      this.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
