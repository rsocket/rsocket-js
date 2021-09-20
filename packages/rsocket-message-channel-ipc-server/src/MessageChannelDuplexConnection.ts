import {
  Closeable,
  Deferred,
  Demultiplexer,
  deserializeFrame,
  deserializeFrames,
  Deserializer,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  serializeFrame,
} from "@rsocket/rsocket-core";
import { MessagePortAdapter } from "./MessageChannelServerTransport";

export class MessageChannelDuplexConnection
  extends Deferred
  implements DuplexConnection, Outbound {
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer & FrameHandler;
  private remainingBuffer: Buffer = Buffer.allocUnsafe(0);
  private error: Error;

  constructor(
    private messagePort: MessagePortAdapter,
    frame: Frame,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ) {
    super();

    messagePort.addEventListener("messageerror", this.handleError);
    messagePort.addEventListener("message", this.handleMessage);

    this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(
      frame,
      this
    );
  }

  get availability(): number {
    return this.done ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.messagePort.close();

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    const buffer = serializeFrame(frame);

    this.messagePort.postMessage(buffer);
  }

  private handleError = (): void => {
    this.error = new Error(
      "Message port received a message which could not be handled. See https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/onmessageerror."
    );
    this.close(this.error);
  };

  private handleMessage = (event): void => {
    // convert Uint8Array to buffer instance
    const data = Buffer.from(event.data);
    this.handleData(data);
  };

  private handleData = (chunks: Buffer): void => {
    try {
      const buffer = Buffer.concat([this.remainingBuffer, chunks]);
      const frame = deserializeFrame(buffer);
      this.multiplexerDemultiplexer.handle(frame);
    } catch (error) {
      this.close(error);
    }
  };

  static create(
    messagePort: MessagePort,
    connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): void {
    // TODO: timeout on no data?

    const firstEventListener = async (event) => {
      const buffer = Buffer.from(event.data);
      const setupFrame = deserializeFrame(buffer);
      const connection = new MessageChannelDuplexConnection(
        messagePort,
        setupFrame,
        multiplexerDemultiplexerFactory
      );

      messagePort.removeEventListener("message", firstEventListener);

      if (connection.done) {
        return;
      }

      try {
        await connectionAcceptor(setupFrame, connection);
      } catch (error) {
        connection.close(error);
      }
    };

    messagePort.addEventListener("message", firstEventListener);
  }
}
