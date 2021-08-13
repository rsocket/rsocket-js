import {
  Closeable,
  Deferred,
  DuplexConnection,
  ServerTransport,
} from "@rsocket/rsocket-core";
import net from "net";
import { TcpDuplexConnection } from "./TcpDuplexConnection";

type TcpServerCreator = (options: net.ServerOpts) => net.Server;

type TcpServerOptionsSocketFactory = (options: net.ServerOpts) => net.Server;

type TcpServerOptions = {
  serverOptions?: net.ServerOpts;
  listenOptions: net.ListenOptions;
  socketCreator?: TcpServerOptionsSocketFactory;
};

export class TcpServerTransport implements ServerTransport {
  private readonly serverOptions: net.ServerOpts | undefined | null;
  private readonly listenOptions: net.ListenOptions;
  private readonly serverCreator: TcpServerCreator;

  constructor(options: TcpServerOptions) {
    this.serverOptions = options.serverOptions;
    this.listenOptions = options.listenOptions;
    this.serverCreator =
      options.socketCreator ?? ((options) => new net.Server(options));
  }

  bind(
    connectionAcceptor: (connection: DuplexConnection) => void
  ): Promise<Closeable> {
    return new Promise((resolve, reject) => {
      const socketServer = this.serverCreator(this.serverOptions);

      const earlyCloseListener = (error?: Error) => {
        reject(error);
      };

      socketServer.addListener("close", earlyCloseListener);
      socketServer.addListener("error", earlyCloseListener);
      socketServer.addListener("listening", () => {
        const serverCloseable = new ServerCloseable(socketServer);
        const connectionListener = (socket: net.Socket) => {
          connectionAcceptor(new TcpDuplexConnection(socket));
        };
        const closeListener = (error?: Error) => {
          serverCloseable.close(error);
        };

        socketServer.addListener("connection", connectionListener);
        socketServer.removeListener("close", earlyCloseListener);
        socketServer.removeListener("error", earlyCloseListener);

        socketServer.addListener("close", closeListener);
        socketServer.addListener("error", closeListener);

        resolve(serverCloseable);
      });

      socketServer.listen(this.listenOptions);
    });
  }
}

class ServerCloseable extends Deferred {
  constructor(private readonly server: net.Server) {
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
