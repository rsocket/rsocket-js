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
  serializeFrame,
} from "@rsocket/rsocket-core";
import WebSocket, { CloseEvent, ErrorEvent } from "ws";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound {
  readonly multiplexerDemultiplexer: Multiplexer &
    Demultiplexer &
    FrameHandler &
    Closeable;

  constructor(
    private websocket: WebSocket,
    private deserializer: Deserializer,
    multiplexerDemultiplexerFactory: (
      outbound: Outbound
    ) => Multiplexer & Demultiplexer & FrameHandler & Closeable
  ) {
    super();

    websocket.addEventListener("close", this.handleClosed.bind(this));
    websocket.addEventListener("error", this.handleError.bind(this));
    websocket.addEventListener("message", this.handleMessage.bind(this));

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

    this.websocket.removeEventListener("close", this.handleClosed.bind(this));
    this.websocket.removeEventListener("error", this.handleError.bind(this));
    this.websocket.removeEventListener(
      "message",
      this.handleMessage.bind(this)
    );

    this.websocket.close();

    delete this.websocket;

    this.multiplexerDemultiplexer.close(error);

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

      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };
}
