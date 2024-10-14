/*
 * Copyright 2021-2024 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Payload, RSocket, RSocketConnector } from "rsocket-core";
import { TcpClientTransport } from "rsocket-tcp-client";
import {
  encodeBearerAuthMetadata,
  encodeCompositeMetadata,
  encodeRoute,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import { exit } from "process";
import Logger from "../../shared/logger";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;
import MESSAGE_RSOCKET_AUTHENTICATION = WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION;

function makeConnector() {
  // NOTE: THIS EXAMPLE DOES NOT COVER TLS.
  //       ALWAYS USE A SECURE CONNECTION SUCH AS TLS WHEN TRANSMITTING SENSITIVE INFORMATION SUCH AS AUTH TOKENS.
  return new RSocketConnector({
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });
}

function makeMetadata(bearerToken?: string, route?: string) {
  const map = new Map<WellKnownMimeType, Buffer>();

  if (bearerToken) {
    map.set(
      MESSAGE_RSOCKET_AUTHENTICATION,
      encodeBearerAuthMetadata(Buffer.from(bearerToken))
    );
  }

  if (route) {
    const encodedRoute = encodeRoute(route);
    map.set(MESSAGE_RSOCKET_ROUTING, encodedRoute);
  }

  return encodeCompositeMetadata(map);
}

async function requestResponse(
  rsocket: RSocket,
  compositeMetaData: Buffer,
  message: string = ""
): Promise<Payload> {
  return new Promise((resolve, reject) => {
    return rsocket.requestResponse(
      {
        data: Buffer.from(message),
        metadata: compositeMetaData,
      },
      {
        onError: (e) => {
          reject(e);
        },
        onNext: (payload, isComplete) => {
          Logger.info(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {},
        onExtension: () => {},
      }
    );
  });
}

async function main() {
  const connector = makeConnector();

  const rsocket = await connector.connect();

  // NOTE: YOU SHOULD NEVER HARD CODE AN AUTH TOKEN IN A FILE IN THIS WAY. THIS IS PURELY FOR EXAMPLE PURPOSES.
  // The SHA1 HASH of rsocket-js-2024-10
  const exampleToken = "8a7d50f76ef86c75bd3563e55f8835515189dbff";

  // this request SHOULD pass
  const echoResponse = await requestResponse(
    rsocket,
    makeMetadata(exampleToken, "EchoService.echo"),
    "Hello World"
  );
  Logger.info(`EchoService.echo response: ${echoResponse.data.toString()}`);

  // this request will reject (unknown route)
  try {
    await requestResponse(
      rsocket,
      makeMetadata(exampleToken, "UnknownService.unknown"),
      "Hello World"
    );
  } catch (e) {
    Logger.error(`Expected error: ${e}`);
  }

  // this request will reject (no routing data)
  try {
    await requestResponse(rsocket, makeMetadata(exampleToken), "Hello World");
  } catch (e) {
    Logger.error(`Expected error: ${e}`);
  }

  // this request will reject (unknown auth token)
  try {
    await requestResponse(
      rsocket,
      makeMetadata("abc12345", "EchoService.echo"),
      "Hello World"
    );
  } catch (e) {
    Logger.error(`Expected error: ${e}`);
  }

  // this request will reject no auth token)
  try {
    await requestResponse(
      rsocket,
      makeMetadata(null, "EchoService.echo"),
      "Hello World"
    );
  } catch (e) {
    Logger.error(`Expected error: ${e}`);
  }

  const whoAmiResponse = await requestResponse(
    rsocket,
    makeMetadata(exampleToken, "AuthService.whoAmI")
  );
  Logger.info(`AuthService.whoAmI response: ${whoAmiResponse.data.toString()}`);
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    Logger.error(error);
    setTimeout(() => {
      exit(1);
    });
  });
