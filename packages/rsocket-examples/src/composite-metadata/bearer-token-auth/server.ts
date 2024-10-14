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

import {
  Closeable,
  ErrorCodes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketError,
  RSocketServer,
} from "rsocket-core";
import { TcpServerTransport } from "rsocket-tcp-server";
import {
  decodeAuthMetadata,
  decodeCompositeMetadata,
  decodeRoutes,
  WellKnownAuthType,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import { exit } from "process";
import Logger from "../../shared/logger";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;
import MESSAGE_RSOCKET_AUTHENTICATION = WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION;
import BEARER = WellKnownAuthType.BEARER;

let serverCloseable: Closeable;

// NOTE: YOU SHOULD NEVER HARD CODE AN AUTH TOKEN IN A FILE IN THIS WAY. THIS IS PURELY FOR EXAMPLE PURPOSES.
// The SHA1 HASH of rsocket-js-2024-10
const expectedExampleToken = "8a7d50f76ef86c75bd3563e55f8835515189dbff";

const tokenToUserContext = {
  [expectedExampleToken]: {
    firstName: "bob",
    lastName: "builder",
  },
};

function mapMetaData(payload: Payload) {
  const mappedMetaData = new Map<string, any>();
  if (payload.metadata) {
    const decodedCompositeMetaData = decodeCompositeMetadata(payload.metadata);

    for (let metaData of decodedCompositeMetaData) {
      switch (metaData.mimeType) {
        case MESSAGE_RSOCKET_ROUTING.toString(): {
          const tags = [];
          for (let decodedRoute of decodeRoutes(metaData.content)) {
            tags.push(decodedRoute);
          }
          const joinedRoute = tags.join(".");
          mappedMetaData.set(MESSAGE_RSOCKET_ROUTING.toString(), joinedRoute);
          break;
        }

        case MESSAGE_RSOCKET_AUTHENTICATION.toString(): {
          const auth = decodeAuthMetadata(metaData.content);
          mappedMetaData.set(MESSAGE_RSOCKET_AUTHENTICATION.toString(), auth);
          break;
        }
      }
    }
  }
  return mappedMetaData;
}

class EchoService {
  handleEchoRequestResponse(
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber,
    payload: Payload,
    mappedMetaData: Map<string, any>
  ) {
    const timeout = setTimeout(() => {
      responderStream.onNext(
        {
          data: Buffer.concat([Buffer.from("Echo: "), payload.data]),
        },
        true
      );
    }, 1000);
    return {
      cancel: () => {
        clearTimeout(timeout);
        Logger.info("Request cancelled...");
      },
      onExtension: () => {
        Logger.info("Received Extension request");
      },
    };
  }
}

class AuthService {
  handleWhoAmIRequestResponse(
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber,
    payload: Payload,
    mappedMetaData: Map<string, any>
  ) {
    const timeout = setTimeout(() => {
      const authContext = mappedMetaData.get(
        MESSAGE_RSOCKET_AUTHENTICATION.toString()
      );
      const authToken = authContext.payload.toString();
      const userContext = tokenToUserContext[authToken];
      if (!userContext) {
        responderStream.onError(
          new RSocketError(
            ErrorCodes.REJECTED,
            "No user found for given token."
          )
        );
        return;
      }
      responderStream.onNext(
        {
          data: Buffer.from(JSON.stringify(userContext)),
        },
        true
      );
    });
    return {
      cancel: () => {
        clearTimeout(timeout);
        Logger.info("Request cancelled...");
      },
      onExtension: () => {
        Logger.info("Received Extension request");
      },
    };
  }
}

function authMiddleware(mappedMetaData: Map<string, any>) {
  const auth = mappedMetaData.get(MESSAGE_RSOCKET_AUTHENTICATION.toString());
  if (!auth) {
    return new RSocketError(
      ErrorCodes.REJECTED,
      "Missing authentication context."
    );
  }
  if (auth.type.identifier !== BEARER.identifier) {
    return new RSocketError(
      ErrorCodes.REJECTED,
      `Unsupported authentication type provided. Identifier=${auth.type.identifier}`
    );
  }
  const token = auth.payload.toString();
  if (token !== expectedExampleToken) {
    return new RSocketError(
      ErrorCodes.REJECTED,
      `Invalid Bearer token provided.`
    );
  }
}

function makeServer() {
  // NOTE: THIS EXAMPLE DOES NOT COVER TLS.
  //       ALWAYS USE A SECURE CONNECTION SUCH AS TLS WHEN TRANSMITTING SENSITIVE INFORMATION SUCH AS AUTH TOKENS.
  return new RSocketServer({
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
          const echoService = new EchoService();
          const authService = new AuthService();
          const mappedMetaData = mapMetaData(payload);

          const defaultSubscriber = {
            cancel() {
              Logger.info("Request cancelled...");
            },
            onExtension() {},
          };

          const authError = authMiddleware(mappedMetaData);
          if (authError) {
            Logger.error(`Auth error: ${authError}`);
            responderStream.onError(authError);
            return defaultSubscriber;
          }

          const route = mappedMetaData.get(MESSAGE_RSOCKET_ROUTING.toString());
          if (!route) {
            responderStream.onError(
              new RSocketError(
                ErrorCodes.REJECTED,
                "Composite metadata did not include routing information."
              )
            );
            return defaultSubscriber;
          }

          Logger.info(`Handling ${route}`);

          switch (route) {
            case "EchoService.echo": {
              return echoService.handleEchoRequestResponse(
                responderStream,
                payload,
                mappedMetaData
              );
            }
            case "AuthService.whoAmI": {
              return authService.handleWhoAmIRequestResponse(
                responderStream,
                payload,
                mappedMetaData
              );
            }

            default: {
              responderStream.onError(
                new RSocketError(
                  ErrorCodes.REJECTED,
                  "The encoded route was unknown by the server."
                )
              );
              return defaultSubscriber;
            }
          }
        },
      }),
    },
  });
}

async function main() {
  const server = makeServer();

  serverCloseable = await server.bind();

  Logger.info("Server bound...");

  await new Promise((resolve, reject) => {
    serverCloseable.onClose((e) => {
      Logger.info("Server closed...");
      if (e) return reject(e);
      resolve(null);
    });
  });
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
