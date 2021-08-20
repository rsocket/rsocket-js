import { RSocketConnector } from "@rsocket/rsocket-core";
import { WebsocketClientTransport } from "@rsocket/rsocket-websocket-client";
import { exit } from "process";
import WebSocket from "ws";

async function main() {
  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });

  const rsocket = await connector.connect();

  await new Promise((resolve, reject) => {
    const requester = rsocket.requestStream(
      {
        data: Buffer.from("Hello World"),
      },
      1,
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );

          requester.request(5);

          if (isComplete) {
            resolve(payload);
          }
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
      }
    );
  });
}

main().then(() => exit());
