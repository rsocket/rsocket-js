import { ClientTransport, DuplexConnection } from "@rsocket/rsocket-types";
import { WebsocketDuplexConnection } from "./WebsocketDuplexConnection";

export type ClientOptions = {
  url: string;
  wsCreator?: (url: string) => WebSocket;
  debug?: boolean;
};

export class WebsocketClientTransport implements ClientTransport {
  private url: string;
  private factory: (url: string) => WebSocket;

  constructor(options: ClientOptions) {
    this.url = options.url;
    this.factory = options.wsCreator ?? ((url: string) => new WebSocket(url));
  }

  connect(): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      const websocket = this.factory(this.url);

      websocket.binaryType = "arraybuffer";

      const openListener = () => {
        websocket.removeEventListener("open", openListener);
        websocket.removeEventListener("error", errorListener);
        resolve(new WebsocketDuplexConnection(websocket));
      };

      const errorListener = (ev: ErrorEvent) => {
        websocket.removeEventListener("open", openListener);
        websocket.removeEventListener("error", errorListener);
        reject(ev.error);
      };

      websocket.addEventListener("open", openListener);
      websocket.addEventListener("error", errorListener);
    });
  }
}
