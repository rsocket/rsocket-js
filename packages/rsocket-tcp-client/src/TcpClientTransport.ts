import net from "net";
import { ClientTransport, DuplexConnection } from "@rsocket/rsocket-types";
import { TcpDuplexConnection } from "./TcpDuplexConnection";

export type ClientOptions = {
  connectionOptions: net.NetConnectOpts;
};

export class TcpClientTransport implements ClientTransport {
  private readonly connectionOptions: net.NetConnectOpts;

  constructor(options: ClientOptions) {
    this.connectionOptions = options.connectionOptions;
  }

  connect(): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      const openListener = () => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        resolve(new TcpDuplexConnection(socket));
      };

      const errorListener = (error: Error) => {
        socket.removeListener("error", errorListener);
        socket.removeListener("close", errorListener);
        socket.removeListener("end", errorListener);
        reject(error);
      };

      socket = net.connect(this.connectionOptions, openListener);

      socket.once("error", errorListener);
      socket.once("close", errorListener);
      socket.once("end", errorListener);
    });
  }
}
