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
  RSocket,
  RSocketConnector,
  RSocketServer,
} from "rsocket-core";
import { TcpClientTransport } from "rsocket-transport-tcp-client";
import { TcpServerTransport } from "rsocket-transport-tcp-server";
import { exit } from "process";

let serverCloseable;

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

async function requestResponse(rsocket: RSocket) {
  return new Promise((resolve, reject) => {
    return rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => {
          reject(e);
        },
        onNext: (payload, isComplete) => {
          console.log(
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

  await requestResponse(rsocket);
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
