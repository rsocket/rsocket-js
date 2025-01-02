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
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketConnector,
  RSocketServer,
} from "@rsocket/core";
import { WebsocketClientTransport } from "@rsocket/websocket-client";
import { WebsocketServerTransport } from "@rsocket/websocket-server";
import { exit } from "process";
import WebSocket from "ws";
import Logger from "../shared/logger";

function makeServer() {
  return new RSocketServer({
    transport: new WebsocketServerTransport({
      wsCreator: (options) => {
        return new WebSocket.Server({
          port: 8080,
        });
      },
    }),
    acceptor: {
      accept: async () => {
        return {
          requestStream: (
            payload: Payload,
            initialRequestN,
            responderStream: OnTerminalSubscriber &
              OnNextSubscriber &
              OnExtensionSubscriber
          ) => {
            Logger.info(
              `[server] requestStream payload[data: ${payload.data}; metadata: ${payload.metadata}]|initialRequestN: ${initialRequestN}`
            );

            let interval = null;
            let requestedResponses = initialRequestN;
            let sentResponses = 0;

            // simulate async data with interval
            interval = setInterval(() => {
              sentResponses++;
              let isComplete = sentResponses >= requestedResponses;
              responderStream.onNext(
                {
                  data: Buffer.from(new Date()),
                  metadata: undefined,
                },
                isComplete
              );
              if (isComplete) {
                clearInterval(interval);
              }
            }, 750);

            return {
              cancel() {
                Logger.info("[server] stream cancelled by client");
                clearInterval(interval);
              },
              request(n) {
                requestedResponses += n;
                Logger.info(
                  `[server] request n: ${n}, requestedResponses: ${requestedResponses}, sentResponses: ${sentResponses}`
                );
              },
              onExtension: () => {},
            };
          },
        };
      },
    },
  });
}

function makeConnector() {
  return new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });
}

let serverCloseable;

async function main() {
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();

  await new Promise((resolve, reject) => {
    let payloadsReceived = 0;
    const maxPayloads = 10;
    const requester = rsocket.requestStream(
      {
        data: Buffer.from("Hello World"),
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
  })
  .finally(() => {
    serverCloseable.close();
  });
