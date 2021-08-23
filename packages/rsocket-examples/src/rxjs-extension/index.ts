import { exit } from "process";
import Logger from "../shared/logger";
import { makeServer } from "./server";
import { makeConnector } from "./client";
import { wrapConnector } from "./extension";

let serverCloseable;

async function main() {
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();
  const rxjsRsocket = wrapConnector(rsocket);

  await new Promise((resolve, reject) => {
    rxjsRsocket
      .fireAndForget({
        data: Buffer.from("Hello World"),
      })
      .subscribe({
        error: (err) => reject(err),
        complete: () => {
          Logger.info("[client] [fireAndForget] completed");
          resolve(null);
        },
      });
  });

  await new Promise((resolve, reject) => {
    rxjsRsocket
      .requestResponse({
        data: Buffer.from("Hello World"),
      })
      .subscribe({
        next: (payload) => {
          Logger.info("[client] [requestResponse] next", payload);
          resolve(payload);
        },
        error: (err) => reject(err),
        complete: () => {
          Logger.info("[client] [requestResponse] completed");
          resolve(null);
        },
      });
  });

  await new Promise((resolve, reject) => {
    rxjsRsocket
      .requestStream(
        {
          data: Buffer.from("Hello World"),
        },
        5
      )
      .subscribe({
        next: (payload) => {
          Logger.info("[client] [requestStream] next", payload);
        },
        error: (err) => reject(err),
        complete: () => {
          Logger.info("[client] [requestStream] completed");
          resolve(null);
        },
      });
  });
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
