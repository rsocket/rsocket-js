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

  const fnfObs = rxjsRsocket.fireAndForget({
    data: Buffer.from("[fireAndForget] Hello World"),
  });

  const reqResObs = rxjsRsocket.requestResponse({
    data: Buffer.from("[requestResponse] Hello World"),
  });

  const reqStreamObs = rxjsRsocket.requestStream(
    {
      data: Buffer.from("[requestStream] Hello World"),
    },
    5
  );

  await new Promise((resolve, reject) => {
    fnfObs.subscribe({
      error: (err) => reject(err),
      complete: () => {
        Logger.info("[client] [fireAndForget] completed");
        resolve(null);
      },
    });
  });

  await new Promise((resolve, reject) => {
    reqResObs.subscribe({
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
    reqStreamObs.subscribe({
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
