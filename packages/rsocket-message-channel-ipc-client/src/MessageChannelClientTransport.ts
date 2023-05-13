import {
  ClientTransport,
  Closeable,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  FrameHandler,
  Multiplexer,
  Outbound,
} from "rsocket-core";
import { MessageChannelDuplexConnection } from "./MessageChannelDuplexConnection";

export type ClientOptions = {
  messagePortProvider: () => Promise<any>;
};

export class MessageChannelClientTransport implements ClientTransport {
  private messagePortProvider: () => Promise<any>;

  constructor(options: ClientOptions) {
    this.messagePortProvider = options.messagePortProvider;
  }

  async connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    const port = await this.messagePortProvider();
    return new MessageChannelDuplexConnection(
      port,
      new Deserializer(),
      multiplexerDemultiplexerFactory
    );
  }
}
