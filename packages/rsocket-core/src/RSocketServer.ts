import { ClientServerInputMultiplexerDemultiplexer } from "./ClientServerMultiplexerDemultiplexer";
import { Closeable } from "./Common";
import { SocketAcceptor } from "./RSocket";
import { ServerTransport } from "./Transport";

export type ServerConfig = {
  transport: ServerTransport;
  acceptor: SocketAcceptor;
  lease?: {};
  resume?: {};
};

export class RSocketServer {
  private transport: ServerTransport;
  private acceptor: SocketAcceptor;

  constructor(config: ServerConfig) {
    this.acceptor = config.acceptor;
    this.transport = config.transport;
  }

  async bind(): Promise<Closeable> {
    return await this.transport.bind((connection) => {
      new ClientServerInputMultiplexerDemultiplexer(connection, {
        fragmentSize: 0,
        keepAlive: {
          hasSender: false,
        },
        streamIdSupplier: () => 2,
        acceptor: this.acceptor,
      });
    });
  }
}
