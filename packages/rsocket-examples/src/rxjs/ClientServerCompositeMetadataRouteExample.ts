import {
  decodeCompositeMetadata,
  decodeRoutes,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";
import { Payload, RSocketConnector, RSocketServer } from "@rsocket/core";
import { Codec, RSocketRequester, RSocketResponder } from "@rsocket/messaging";
import { RxRequestersFactory, RxRespondersFactory } from "@rsocket/rxjs";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";
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
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;

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
  handleEchoRequestResponse(data: string): Observable<string> {
    return timer(1000).pipe(map(() => `Echo: ${data}`));
  }

  // TODO: look into why only first value is ever emitted,
  // suspect issue with `drain()` in rx adapter.
  handleEchoRequestStream(data: string): Observable<string> {
    return interval(1000).pipe(
      map(() => `RxEchoService Echo: ${data}`),
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
  let count = 10;
  return new Promise((resolve, reject) => {
    rsocket
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
        take(5)
      )
      .subscribe({
        complete: () => {
          resolve(null);
        },
        error: (error) => {
          reject(error);
        },
      });
  });
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

  await requestStream(requester, "EchoService.echoStream");
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
