import {
  ClientTransport,
  Closeable,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  FrameHandler,
  Multiplexer,
  Outbound,
} from "@rsocket/rsocket-core";
import net, { SocketConnectOpts } from "net";
import { TcpDuplexConnection } from "./TcpDuplexConnection";

type TcpSocketCreator = (
  options: SocketConnectOpts,
  connectionListener?: () => void
) => net.Socket;

type TcpClientOptionsSocketFactory = (
  options: net.NetConnectOpts
) => net.Socket;

type TcpClientOptions = {
  connectionOptions: net.NetConnectOpts;
  socketCreator?: TcpClientOptionsSocketFactory;
};

export class TcpClientTransport implements ClientTransport {
  private readonly connectionOptions: net.NetConnectOpts;
  private readonly socketCreator: TcpSocketCreator;

  constructor(options: TcpClientOptions) {
    this.connectionOptions = options.connectionOptions;
    this.socketCreator =
      options.socketCreator ?? ((options) => net.connect(options));
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound
    ) => Multiplexer & Demultiplexer & FrameHandler & Closeable
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      const openListener = () => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        resolve(
          new TcpDuplexConnection(
            socket,
            new Deserializer(),
            multiplexerDemultiplexerFactory
          )
        );
      };

      const errorListener = (error: Error) => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        reject(error);
      };

      socket = this.socketCreator(this.connectionOptions);

      socket.once("connect", openListener);
      socket.once("error", errorListener);
      socket.once("close", errorListener);
      socket.once("end", errorListener);
    });
  }
}
