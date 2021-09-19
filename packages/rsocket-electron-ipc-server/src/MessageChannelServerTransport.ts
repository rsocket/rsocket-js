import {
  Closeable,
  Deferred,
  Demultiplexer,
  DuplexConnection,
  Frame,
  FrameHandler,
  Multiplexer,
  Outbound,
  ServerTransport,
} from "@rsocket/rsocket-core";
import { MessageChannelDuplexConnection } from "./MessageChannelDuplexConnection";
import { MessagePortMain } from "electron";

export type ServerOptions = {
  messagePortProvider: () => Promise<any>;
};

export class MessageChannelServerTransport implements ServerTransport {
  private messagePortProvider: () => Promise<any>;

  constructor(options: ServerOptions) {
    this.messagePortProvider = options.messagePortProvider;
  }

  async bind(
    connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<Closeable> {
    const messagePort = await this.messagePortProvider();

    MessageChannelDuplexConnection.create(
      messagePort,
      connectionAcceptor,
      multiplexerDemultiplexerFactory
    );

    return new ServerCloseable();
  }
}

class ServerCloseable extends Deferred {
  constructor() {
    super();
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    super.close();
  }
}

export interface MessagePortAdapter {
  addEventListener(type: "message", listener): any;

  addEventListener(type: "close", listener): any;

  addEventListener(type, listener): void;

  removeEventListener(type: "message", listener): any;

  removeEventListener(type: "close", listener): any;

  removeEventListener(type, listener): void;

  postMessage(data): void;

  close(): void;

  dispatchEvent(event: Event): boolean;

  start(): void;
}

export class MessagePortMainElectronApiAdapter implements MessagePortAdapter {
  constructor(private messagePort: MessagePortMain) {}

  addEventListener(type: "message", listener);
  addEventListener(type: "close", listener);
  addEventListener(type, listener) {
    this.messagePort.addListener(type, listener);
  }

  removeEventListener(type: "message", listener);
  removeEventListener(type: "close", listener);
  removeEventListener(type, listener) {
    this.messagePort.removeListener(type, listener);
  }

  postMessage(data) {
    this.messagePort.postMessage(data);
  }

  close(): void {
    this.messagePort.close();
  }

  dispatchEvent(event: Event): boolean {
    return false;
  }

  start(): void {
    this.messagePort.start();
  }
}
