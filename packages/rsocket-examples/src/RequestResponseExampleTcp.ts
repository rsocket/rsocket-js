import {
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketConnector,
  RSocketServer,
} from "@rsocket/rsocket-core";
import { TcpClientTransport } from "@rsocket/rsocket-tcp-client";
import { TcpServerTransport } from "@rsocket/rsocket-tcp-server";
import { exit } from "process";

async function main() {
  const server = new RSocketServer({
    transport: new TcpServerTransport({
      listenOptions: {
        port: 9090,
        host: "127.0.0.1",
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
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
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
        onComplete: () => {},
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
