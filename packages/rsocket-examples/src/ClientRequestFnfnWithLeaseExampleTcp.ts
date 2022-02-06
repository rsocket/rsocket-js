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

import { RSocket, RSocketConnector } from "@rsocket/core";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { exit } from "process";

let serverCloseable;

function makeConnector() {
  return new RSocketConnector({
    lease: {},
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });
}

async function fnf(rsocket: RSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    return rsocket.fireAndForget(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => {
          reject(e);
        },
        onComplete: () => {
          resolve();
        },
      }
    );
  });
}

async function main() {
  const connector = makeConnector();

  const rsocket = await connector.connect();

  await fnf(rsocket);
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
