/*
 * Copyright 2021-2022 the original author or authors.
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
  ErrorCodes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocket,
  RSocketConnector,
  RSocketError,
  RSocketServer,
} from "rsocket-core";
import { TcpClientTransport } from "rsocket-tcp-client";
import { TcpServerTransport } from "rsocket-tcp-server";
import {
  decodeCompositeMetadata,
  decodeRoutes,
  encodeCompositeMetadata,
  encodeRoute,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import { exit } from "process";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;
import Logger from "./shared/logger";

let serverCloseable;

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
    payload: Payload
  ) {
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
  }
}

function makeServer() {
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
          const mappedMetaData = mapMetaData(payload);

          const defaultSusbcriber = {
            cancel() {
              console.log("cancelled");
            },
            onExtension() {},
          };

          const route = mappedMetaData.get(MESSAGE_RSOCKET_ROUTING.toString());
          if (!route) {
            responderStream.onError(
              new RSocketError(
                ErrorCodes.REJECTED,
                "Composite metadata did not include routing information."
              )
            );
            return defaultSusbcriber;
          }

          switch (route) {
            case "EchoService.echo": {
              return echoService.handleEchoRequestResponse(
                responderStream,
                payload
              );
            }

            default: {
              responderStream.onError(
                new RSocketError(
                  ErrorCodes.REJECTED,
                  "The encoded route was unknown by the server."
                )
              );
              return defaultSusbcriber;
            }
          }
        },
      }),
    },
  });
}

function makeConnector() {
  return new RSocketConnector({
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });
}

async function requestResponse(rsocket: RSocket, route?: string) {
  let compositeMetaData = undefined;
  if (route) {
    const encodedRoute = encodeRoute(route);

    const map = new Map<WellKnownMimeType, Buffer>();
    map.set(MESSAGE_RSOCKET_ROUTING, encodedRoute);
    compositeMetaData = encodeCompositeMetadata(map);
  }

  return new Promise((resolve, reject) => {
    return rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
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
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();

  // this request will pass
  await requestResponse(rsocket, "EchoService.echo");

  // this request will reject (unknown route)
  try {
    await requestResponse(rsocket, "UnknownService.unknown");
  } catch (e) {
    Logger.error(e);
  }

  // this request will reject (no routing data)
  try {
    await requestResponse(rsocket);
  } catch (e) {
    Logger.error(e);
  }
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
