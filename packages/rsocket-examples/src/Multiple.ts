import { RSocketConnector } from "@rsocket/rsocket-core";
import { TcpClientTransport } from "@rsocket/rsocket-tcp-client";
import { exit } from "process";

async function connect() {
  const connector = new RSocketConnector({
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });

  return await connector.bind();
}

async function fireAndForget(rsocket) {
  await new Promise((resolve, reject) =>
    rsocket.fireAndForget(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => reject(e),
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
      }
    )
  );
}

async function requestResponse(rsocket) {
  await new Promise((resolve, reject) =>
    rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|isComplete=${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {},
        onExtension: () => {},
      }
    )
  );
}

async function requestStream(rsocket) {
  await new Promise((resolve, reject) => {
    let received = 0;
    const batchSize = 5;
    const requester = rsocket.requestStream(
      {
        data: Buffer.from("Hello World"),
      },
      batchSize,
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          ++received;
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|isComplete=${isComplete}`
          );

          // TODO: `onComplete` should be invoked in scenario where `isComplete` is true so that
          //  resolution can happen consistently via `onComplete`
          if (isComplete) {
            resolve(null);
          } else {
            // request n more once received original n and not complete
            if (received % batchSize == 0) {
              console.log(`[requester.request] ${batchSize}`);
              requester.request(batchSize);
            }
          }
        },
        onComplete: () => {
          console.log("[requestStream] onComplete");
          resolve(null);
        },
        onExtension: () => {},
      }
    );
  });
}

async function main() {
  const rsocket = await connect();

  console.log("[FireAndForget] Start");
  await fireAndForget(rsocket);
  console.log("[FireAndForget] End\n");

  console.log("[RequestResponse] Start");
  await requestResponse(rsocket);
  console.log("[RequestResponse] End\n");

  console.log("[RequestResponse] Start");
  await requestStream(rsocket);
  console.log("[RequestResponse] End\n");
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
