import { RSocket, RSocketConnector } from "rsocket-core";
import { TcpClientTransport } from "rsocket-transport-tcp-client";
import {
  encodeCompositeMetadata,
  encodeRoute,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import Logger from "./shared/logger";
import { exit } from "process";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;
import MESSAGE_RSOCKET_COMPOSITE_METADATA = WellKnownMimeType.MESSAGE_RSOCKET_COMPOSITE_METADATA;

/**
 * This example assumes you have a RSocket server running on 127.0.0.1:9000 that will respond
 * to requests at the following routes:
 *  - login (requestResponse)
 *  - message (requestResponse)
 *  - messages.incoming (requestStream)
 */

function makeConnector() {
  const connectorConnectionOptions = {
    host: "127.0.0.1",
    port: 9000,
  };
  console.log(
    `Creating connector to ${JSON.stringify(connectorConnectionOptions)}`
  );
  return new RSocketConnector({
    setup: {
      metadataMimeType: MESSAGE_RSOCKET_COMPOSITE_METADATA.string,
    },
    transport: new TcpClientTransport({
      connectionOptions: connectorConnectionOptions,
    }),
  });
}

function createRoute(route?: string) {
  let compositeMetaData = undefined;
  if (route) {
    const encodedRoute = encodeRoute(route);

    const map = new Map<WellKnownMimeType, Buffer>();
    map.set(MESSAGE_RSOCKET_ROUTING, encodedRoute);
    compositeMetaData = encodeCompositeMetadata(map);
  }
  return compositeMetaData;
}

async function requestResponse(rsocket: RSocket, route: string, data: string) {
  console.log(`Executing requestResponse: ${JSON.stringify({ route, data })}`);
  return new Promise((resolve, reject) => {
    return rsocket.requestResponse(
      {
        data: Buffer.from(data),
        metadata: createRoute(route),
      },
      {
        onError: (e) => {
          reject(e);
        },
        onNext: (payload, isComplete) => {
          Logger.info(
            `requestResponse onNext payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {
          Logger.info(`requestResponse onComplete`);
          resolve(null);
        },
        onExtension: () => {},
      }
    );
  });
}

async function main() {
  const connector = makeConnector();
  const rsocket = await connector.connect();

  await requestResponse(rsocket, "login", "user1");

  await requestResponse(
    rsocket,
    "message",
    JSON.stringify({ user: "user1", content: "a message" })
  );

  await new Promise((resolve, reject) => {
    let payloadsReceived = 0;
    const maxPayloads = 10;
    const requester = rsocket.requestStream(
      {
        data: Buffer.from("Hello World"),
        metadata: createRoute("messages.incoming"),
      },
      3,
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          Logger.info(
            `[client] payload[data: ${payload.data}; metadata: ${payload.metadata}]|isComplete: ${isComplete}`
          );

          payloadsReceived++;

          // request 5 more payloads every 5th payload, until a max total payloads received
          if (payloadsReceived % 2 == 0 && payloadsReceived < maxPayloads) {
            requester.request(2);
          } else if (payloadsReceived >= maxPayloads) {
            requester.cancel();
            setTimeout(() => {
              resolve(null);
            });
          }

          if (isComplete) {
            resolve(null);
          }
        },
        onComplete: () => {
          Logger.info(`requestStream onComplete`);
          resolve(null);
        },
        onExtension: () => {},
      }
    );
  });
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
