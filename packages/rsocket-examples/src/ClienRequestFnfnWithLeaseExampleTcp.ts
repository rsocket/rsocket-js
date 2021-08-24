import { RSocket, RSocketConnector } from "@rsocket/rsocket-core";
import { TcpClientTransport } from "@rsocket/rsocket-tcp-client";
import { exit } from "process";

let serverCloseable;

function makeConnector() {
  return new RSocketConnector({
    lease: {},
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });
}

async function fnf(rsocket: RSocket) {
  return new Promise((resolve, reject) => {
    return rsocket.fireAndForget(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => {
          reject(e);
        },
        onComplete: () => {
          resolve(null);
        },
      }
    );
  });
}

async function main() {
  const connector = makeConnector();

  const rsocket = await connector.connect();

  await fnf(rsocket);
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  })
  .finally(() => {
    serverCloseable.close();
  });
