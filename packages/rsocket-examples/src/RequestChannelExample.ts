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

  await new Promise((resolve, reject) => {
    const requester = rsocket.requestChannel(
      {
        data: Buffer.from("Hello World"),
      },
      1,
      false,
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );

          requester.request(1);

          if (isComplete) {
            resolve(payload);
          }
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
        request: (n) => {
          console.log(`request(${n})`);
          requester.onNext(
            {
              data: Buffer.from("Message"),
            },
            true
          );
        },
        cancel: () => {},
      }
    );
  });
}

main().then(() => exit());
