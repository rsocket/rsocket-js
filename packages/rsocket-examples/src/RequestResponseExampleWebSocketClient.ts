import { RSocketConnector } from "@rsocket/rsocket-core";
import { WebsocketClientTransport } from "@rsocket/rsocket-websocket-client";
import { exit } from "process";
import WebSocket from "ws";

async function main() {
  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url),
    }),
  });

  const rsocket = await connector.bind();

  await new Promise((resolve, reject) =>
    rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
      }
    )
  );
}

main().then(() => exit());
