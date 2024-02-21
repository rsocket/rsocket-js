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

import { RSocket, RSocketConnector, RSocketServer } from "@rsocket/core";
import { Codec } from "@rsocket/messaging";
import {
  RxRequestersFactory,
  RxRespondersFactory,
} from "@rsocket/adapter-rxjs";
import { TcpClientTransport } from "@rsocket/tcp-client";
import { TcpServerTransport } from "@rsocket/tcp-server";
import { exit } from "process";
import {
  firstValueFrom,
  interval,
  map,
  Observable,
  of,
  take,
  tap,
  timer,
} from "rxjs";
import Logger from "../shared/logger";

let serverCloseable;

class EchoService {
  handleEchoRequestResponse(data: string): Observable<string> {
    return timer(1000).pipe(map(() => `Echo: ${data}`));
  }

  handleEchoRequestStream(data: string): Observable<string> {
    return interval(1000).pipe(
      map(() => `RxEchoService Echo: ${data}`),
      tap((value) => {
        Logger.info(`[server] sending: ${value}`);
      })
    );
  }

  handleEchoRequestChannel(datas: Observable<string>): Observable<string> {
    datas
      .pipe(
        tap((value) => {
          Logger.info(`[server] receiving: ${value}`);
        })
      )
      .subscribe();
    return interval(200).pipe(
      map((data) => `RxEchoService Echo: ${data}`),
      tap((value) => {
        Logger.info(`[server] sending: ${value}`);
      })
    );
  }

  handleLogFireAndForget(data: string): Observable<void> {
    Logger.info(`[server] received: ${data}`);
    return of(null);
  }
}

function makeServer() {
  const stringCodec = new StringCodec();
  return new RSocketServer({
    transport: new TcpServerTransport({
      listenOptions: {
        port: 9090,
        host: "127.0.0.1",
      },
    }),
    acceptor: {
      accept: async () => {
        const echoService = new EchoService();
        return {
          fireAndForget: RxRespondersFactory.fireAndForget(
            echoService.handleLogFireAndForget,
            stringCodec
          ),
          requestResponse: RxRespondersFactory.requestResponse(
            echoService.handleEchoRequestResponse,
            { inputCodec: stringCodec, outputCodec: stringCodec }
          ),
          requestStream: RxRespondersFactory.requestStream(
            echoService.handleEchoRequestStream,
            { inputCodec: stringCodec, outputCodec: stringCodec }
          ),
          requestChannel: RxRespondersFactory.requestChannel(
            echoService.handleEchoRequestChannel,
            { inputCodec: stringCodec, outputCodec: stringCodec },
            4
          ),
        };
      },
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

async function fireAndForget(rsocket: RSocket, route: string = "") {
  return new Promise((resolve, reject) => {
    const request = RxRequestersFactory.fireAndForget(
      "Hello World",
      stringCodec
    );
    request(rsocket).subscribe({
      complete() {
        // give server a chance to handle before continuing
        setTimeout(() => {
          resolve(null);
        }, 100);
      },
      error(err) {
        reject(err);
      },
    });
  });
}

async function requestResponse(rsocket: RSocket) {
  const request = RxRequestersFactory.requestResponse(
    "Hello World",
    stringCodec,
    stringCodec
  );
  return firstValueFrom(
    request(rsocket).pipe(tap((data) => Logger.info(`payload[data: ${data};]`)))
  );
}

async function requestStream(rsocket: RSocket) {
  const request = RxRequestersFactory.requestStream(
    "Hello World",
    stringCodec,
    stringCodec,
    5
  );
  return request(rsocket)
    .pipe(
      tap((data) => {
        Logger.info(`[client] received[data: ${data}]`);
      }),
      take(10)
    )
    .toPromise();
}

async function requestChannel(rsocket: RSocket) {
  const request = RxRequestersFactory.requestChannel(
    interval(1000).pipe(
      map((i) => `Hello World ${i}`),
      tap((data) => {
        Logger.info(`[client] produced[data: ${data}]`);
      })
    ),
    stringCodec,
    stringCodec,
    5
  );
  return request(rsocket)
    .pipe(
      tap((data) => {
        Logger.info(`[client] received[data: ${data}]`);
      }),
      take(25)
    )
    .toPromise();
}

class StringCodec implements Codec<string> {
  readonly mimeType: string = "text/plain";

  decode(buffer: Buffer): string {
    return buffer.toString();
  }

  encode(entity: string): Buffer {
    return Buffer.from(entity);
  }
}

const stringCodec = new StringCodec();

async function main() {
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();

  Logger.info(`----- Fire And Forget -----`);
  await fireAndForget(rsocket);

  Logger.info(`----- Request Response -----`);
  await requestResponse(rsocket);

  Logger.info(`----- Request Stream -----`);
  await requestStream(rsocket);

  Logger.info(`----- Request Channel -----`);
  await requestChannel(rsocket);
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
