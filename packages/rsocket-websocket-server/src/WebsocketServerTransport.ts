import {
  Closeable,
  Deferred,
  DuplexConnection,
  ServerTransport,
} from "@rsocket/rsocket-core";
import WebSocket, { Server } from "ws";
import { WebsocketDuplexConnection } from "./WebsocketDuplexConnection";

export type SocketFactory = (options: SocketOptions) => Server;

export type SocketOptions = {
  host?: string;
  port?: number;
};

export type ServerOptions = SocketOptions & {
  wsCreator?: SocketFactory;
  debug?: boolean;
};

const defaultFactory: SocketFactory = (options: SocketOptions) => {
  return new Server({
    host: options.host,
    port: options.port,
  });
};

export class WebsocketServerTransport implements ServerTransport {
  private readonly host: string;
  private readonly port: number;
  private readonly factory: SocketFactory;

  constructor(options: ServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.factory = options.wsCreator ?? defaultFactory;
  }

  async bind(
    connectionAcceptor: (connection: DuplexConnection) => void
  ): Promise<Closeable> {
    const websocketServer: Server = await this.connectServer();
    const serverCloseable = new ServerCloseable(websocketServer);

    const connectionListener = (websocket: WebSocket) => {
      websocket.binaryType = "nodebuffer";
      const duplex = WebSocket.createWebSocketStream(websocket);
      connectionAcceptor(new WebsocketDuplexConnection(duplex));
    };

    const closeListener = (error?: Error) => {
      serverCloseable.close(error);
    };

    websocketServer.addListener("connection", connectionListener);
    websocketServer.addListener("close", closeListener);
    websocketServer.addListener("error", closeListener);

    return serverCloseable;
  }

  private connectServer(): Promise<Server> {
    return new Promise((resolve, reject) => {
      const websocketServer = this.factory({
        host: this.host,
        port: this.port,
      });

      const earlyCloseListener = (error?: Error) => {
        reject(error);
      };

      websocketServer.addListener("close", earlyCloseListener);
      websocketServer.addListener("error", earlyCloseListener);
      websocketServer.addListener("listening", () => {
        resolve(websocketServer);
      });
    });
  }
}

class ServerCloseable extends Deferred {
  constructor(private readonly server: Server) {
    super();
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.server.close();
    super.close();
  }
}
