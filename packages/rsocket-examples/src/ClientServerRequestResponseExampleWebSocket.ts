import {
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketConnector,
  RSocketServer,
} from "@rsocket/rsocket-core";
import { WebsocketClientTransport } from "@rsocket/rsocket-websocket-client";
import { WebsocketServerTransport } from "@rsocket/rsocket-websocket-server";
import { exit } from "process";
import WebSocket from "ws";

async function main() {
  const server = new RSocketServer({
    transport: new WebsocketServerTransport({
      wsCreator: (options) => {
        return new WebSocket.Server({
          port: 8080,
        });
      },
    }),
    acceptor: {
      accept: async () => ({
        requestResponse: (
          payload: Payload,
          responderStream: OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber
        ) => {
          const timeout = setTimeout(
            () =>
              responderStream.onNext(
                {
                  data: Buffer.concat([Buffer.from("Echo: "), payload.data]),
                },
                true
              ),
            1000
          );
          return {
            cancel: () => {
              clearTimeout(timeout);
              console.log("cancelled");
            },
            onExtension: () => {
              console.log("Received Extension request");
            },
          };
        },
      }),
    },
  });

  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });

  const serverCloseable = await server.bind();

  const rsocket = await connector.connect();

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

  serverCloseable.close();
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
