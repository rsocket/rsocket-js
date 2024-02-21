import { RSocketConnector } from "@rsocket/core";
import { WebsocketClientTransport } from "@rsocket/websocket-client";

export async function connect(transportOptions) {
  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      wsCreator: (url) => new WebSocket(url),
      ...transportOptions,
    }),
  });

  return connector.connect();
}

export function createBuffer(value) {
  return Buffer.from(value);
}
