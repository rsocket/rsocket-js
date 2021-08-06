import { Payload, RSocketConnector } from "@rsocket/rsocket-core";
import { TcpClientTransport } from "@rsocket/rsocket-tcp-client";
import { exit } from "process";
import { Observable } from "rxjs";

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

function requestStream(rsocket) {
  return new Observable((subscriber) => {
    let received = 0;
    const batchSize = 5;
    const requester = rsocket.requestStream(
      {
        data: Buffer.from("Hello World"),
      },
      batchSize,
      {
        onError: (e) => subscriber.error(e),
        onNext: (payload, isComplete) => {
          ++received;
          subscriber.next(payload);

          // TODO: if `onComplete` was to be invoked in scenario where `isComplete` is true, that would allow
          //  `subscriber.complete()` to only need to be called in `onComplete`
          if (isComplete) {
            subscriber.complete();
            return;
          }

          // request n more once received original n and not complete
          if (received % batchSize == 0) {
            console.log(`[requester.request] ${batchSize}`);
            requester.request(batchSize);
          }
        },
        onComplete: () => {
          console.log("[requestStream] onComplete");
          subscriber.complete();
        },
        onExtension: () => {},
      }
    );
  });
}

async function main() {
  const rsocket = await connect();
  // |isComplete=${isComplete}
  console.log("[RequestResponse] Start");
  await new Promise((resolve, reject) => {
    requestStream(rsocket).subscribe({
      next(payload: Payload) {
        console.log(
          `payload[data: ${payload.data}; metadata: ${payload.metadata}]`
        );
      },
      complete() {
        resolve(null);
      },
      error(e) {
        reject(e);
      },
    });
  });
  console.log("[RequestResponse] End\n");
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
