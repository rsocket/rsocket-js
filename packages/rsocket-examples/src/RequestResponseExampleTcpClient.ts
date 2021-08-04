import { RSocketConnector } from "@rsocket/rsocket-core";
import { TcpClientTransport } from "@rsocket/rsocket-tcp-client";
import { exit } from "process";

async function main() {
  const connector = new RSocketConnector({
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
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
        onComplete: () => {},
        onExtension: () => {},
      }
    )
  );
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
