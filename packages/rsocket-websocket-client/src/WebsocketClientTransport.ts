import {
  ClientTransport,
  Closeable,
  Demultiplexer,
  Deserializer,
  DuplexConnection,
  FrameHandler,
  Multiplexer,
  Outbound,
} from "@rsocket/core";
import { WebsocketDuplexConnection } from "./WebsocketDuplexConnection";

export type ClientOptions = {
  url: string;
  wsCreator?: (url: string) => WebSocket;
  debug?: boolean;
};

export class WebsocketClientTransport implements ClientTransport {
  private readonly url: string;
  private readonly factory: (url: string) => WebSocket;

  constructor(options: ClientOptions) {
    this.url = options.url;
    this.factory = options.wsCreator ?? ((url: string) => new WebSocket(url));
  }

  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection> {
    return new Promise((resolve, reject) => {
      const websocket = this.factory(this.url);

      websocket.binaryType = "arraybuffer";

      const openListener = () => {
        websocket.removeEventListener("open", openListener);
        websocket.removeEventListener("error", errorListener);
        resolve(
          new WebsocketDuplexConnection(
            websocket,
            new Deserializer(),
            multiplexerDemultiplexerFactory
          )
        );
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
