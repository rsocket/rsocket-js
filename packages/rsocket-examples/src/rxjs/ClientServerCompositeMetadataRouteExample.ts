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

import { RSocketConnector, RSocketServer } from "rsocket-core";
import { Codec, RSocketRequester, RSocketResponder } from "rsocket-messaging";
import { RxRequestersFactory, RxRespondersFactory } from "rsocket-adapter-rxjs";
import { TcpClientTransport } from "rsocket-tcp-client";
import { TcpServerTransport } from "rsocket-tcp-server";
import { exit } from "process";
import {
  firstValueFrom,
  map,
  Observable,
  tap,
  timer,
  interval,
  take,
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
        return RSocketResponder.builder()
          .route(
            "EchoService.echo",
            RxRespondersFactory.requestResponse(
              echoService.handleEchoRequestResponse,
              { inputCodec: stringCodec, outputCodec: stringCodec }
            )
          )
          .route(
            "EchoService.echoStream",
            RxRespondersFactory.requestStream(
              echoService.handleEchoRequestStream,
              { inputCodec: stringCodec, outputCodec: stringCodec }
            )
          )
          .route(
            "EchoService.echoChannel",
            RxRespondersFactory.requestChannel(
              echoService.handleEchoRequestChannel,
              { inputCodec: stringCodec, outputCodec: stringCodec },
              4
            )
          )
          .build();
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

async function requestResponse(rsocket: RSocketRequester, route: string = "") {
  return firstValueFrom(
    rsocket
      .route(route)
      .request(
        RxRequestersFactory.requestResponse(
          "Hello World",
          stringCodec,
          stringCodec
        )
      )
      .pipe(tap((data) => Logger.info(`payload[data: ${data};]`)))
  );
}

async function requestStream(rsocket: RSocketRequester, route: string = "") {
  return rsocket
    .route(route)
    .request(
      RxRequestersFactory.requestStream(
        "Hello World",
        stringCodec,
        stringCodec,
        5
      )
    )
    .pipe(
      tap((data) => {
        Logger.info(`[client] received[data: ${data}]`);
      }),
      take(25)
    )
    .toPromise();
}

async function requestChannel(rsocket: RSocketRequester, route: string = "") {
  return rsocket
    .route(route)
    .request(
      RxRequestersFactory.requestChannel(
        interval(1000).pipe(
          map((i) => `Hello World ${i}`),
          tap((data) => {
            Logger.info(`[client] produced[data: ${data}]`);
          })
        ),
        stringCodec,
        stringCodec,
        5
      )
    )
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
  const requester = RSocketRequester.wrap(rsocket);

  Logger.info(`----- Request Response -----`);

  // this request will pass
  await requestResponse(requester, "EchoService.echo");

  // this request will reject (unknown route)
  try {
    await requestResponse(requester, "UnknownService.unknown");
  } catch (e) {
    Logger.error(e);
  }

  // this request will reject (no routing data)
  try {
    await requestResponse(requester);
  } catch (e) {
    Logger.error(e);
  }

  Logger.info(`----- Request Stream -----`);
  // this request will pass
  await requestStream(requester, "EchoService.echoStream");

  Logger.info(`----- Request Channel -----`);
  // this request will pass
  await requestChannel(requester, "EchoService.echoChannel");
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
