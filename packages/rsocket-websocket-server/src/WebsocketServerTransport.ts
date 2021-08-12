import {
  ServerTransport,
  Closeable,
  DuplexConnection,
  Deferred,
} from "@rsocket/rsocket-core";
import { WebsocketDuplexConnection } from "./WebsocketDuplexConnection";
import WebSocket, { Server } from "ws";
import { IncomingMessage } from "http";

export type ClientOptions = {
  host?: string;
  port?: number;
  wsCreator?: (callback: () => void, host?: string, port?: number) => Server;
  debug?: boolean;
};

export class WebsocketServerTransport implements ServerTransport {
  private host: string;
  private port: number;
  private factory: (host: string, port: number) => Server;

  constructor(options: ClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.factory =
      options.wsCreator ??
      ((host, port) =>
        new Server({
          host,
          port,
        }));
  }

  bind(
    connectionAcceptor: (connection: DuplexConnection) => void
  ): Promise<Closeable> {
    return new Promise((resolve, reject) => {
      const websocketServer = this.factory(this.host, this.port);

      const earlyCloseListener = (error?: Error) => {
        reject(error);
      };

      websocketServer.addListener("close", earlyCloseListener);
      websocketServer.addListener("error", earlyCloseListener);
      websocketServer.addListener("listening", () => {
        const serverCloseable = new ServerCloseable(websocketServer);
        const connectionListener = (
          websocket: WebSocket,
          request: IncomingMessage
        ) => {
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

        resolve(serverCloseable);
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
