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
import { WebsocketClientTransport } from "@rsocket/transport-websocket-client";
import { WebsocketServerTransport } from "@rsocket/transport-websocket-server";
import { exit } from "process";
import WebSocket from "ws";

async function main() {
  const server = new RSocketServer({
    transport: new WebsocketServerTransport({
      wsCreator: (options) => {
        return new WebSocket.Server({
          port: 8080,
        });
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
        },
      }),
    },
  });

  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });

  const serverCloseable = await server.bind();

  const rsocket = await connector.connect();

  await new Promise((resolve, reject) =>
    rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
      }
    )
  );

  serverCloseable.close();
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
