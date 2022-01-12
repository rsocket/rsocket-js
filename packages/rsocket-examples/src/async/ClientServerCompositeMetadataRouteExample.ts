import { RSocketConnector, RSocketServer } from "@rsocket/core";
import {
  Codec,
  DefaultRespondersFactory,
  RSocketRequester,
  RSocketResponder,
} from "@rsocket/messaging";
import { RxRespondersFactory } from "@rsocket/adapter-rxjs";
import {
  AsyncRequestersFactory,
  AsyncRespondersFactory,
} from "@rsocket/adapter-async";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";
import { exit } from "process";
import { interval, map, Observable, take, tap, timer } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import Logger from "../shared/logger";

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
const codecs = { inputCodec: stringCodec, outputCodec: stringCodec };

class RawEchoService {
  handleEchoRequestStream(data: string, initialRequestN, subscriber) {
    let requested = initialRequestN;
    let sent = 0;
    let isDone = false;

    const interval = setInterval(() => {
      sent++;
      isDone = sent >= requested;
      const response = `RawEchoService Echo: ${data}`;
      Logger.info("[server] sending", response);
      subscriber.onNext(
        {
          data: codecs.inputCodec.encode(response),
        },
        isDone
      );
      if (isDone) {
        clearInterval(interval);
      }
    }, 1000);

    return {
      request(n) {
        requested += n;
      },
      cancel() {
        clearInterval(interval);
      },
      onExtension() {},
    };
  }
}

class RxEchoService {
  handleEchoRequestResponse(data: string): Observable<string> {
    Logger.info(
      `[server][RxEchoService.handleEchoRequestResponse] received: ${data}`
    );
    return timer(1000).pipe(
      map(() => `RxEchoService Echo: ${data}`),
      tap((value) => {
        Logger.info(
          `[server][RxEchoService.handleEchoRequestResponse] sending: ${value}`
        );
      })
    );
  }

  // TODO: look into why only first value is ever emitted.
  //  suspect issue with `drain()` in rx adapter
  handleEchoRequestStream(data: string): Observable<string> {
    return interval(1000).pipe(
      map(() => `RxEchoService Echo: ${data}`),
      tap((value) => {
        Logger.info(
          `[server][RxEchoService.handleEchoRequestStream] received: ${value}`
        );
      })
    );
  }
}

class AsyncEchoService {
  async handleHearFireAndForget(data: string): Promise<void> {
    Logger.info(
      `[server][AsyncEchoService.handleHearFireAndForget] received: ${data}`
    );
  }

  async handleEchoRequestResponse(data: string): Promise<string> {
    Logger.info(
      `[server][AsyncEchoService.handleEchoRequestResponse] received: ${data}`
    );
    return `AsyncEchoService Echo: ${data}`;
  }

  handleEchoRequestStream(data: string): AsyncIterable<string> {
    const obs = interval(1000).pipe(
      map(() => `AsyncEchoService Echo: ${data}`),
      tap((value) => {
        Logger.info(
          `[server][AsyncEchoService.handleEchoRequestStream] sending: ${value}`
        );
      })
    );
    // convert rxjs observable into an AsyncIterator
    return eachValueFrom(obs);
  }
}

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
      accept: async () => {
        const rawEchoService = new RawEchoService();
        const rxEchoService = new RxEchoService();
        const asyncEchoService = new AsyncEchoService();

        const builder = RSocketResponder.builder();

        builder.route(
          "RxEchoService.echo",
          RxRespondersFactory.requestResponse(
            rxEchoService.handleEchoRequestResponse,
            codecs
          )
        );

        builder.route(
          "AsyncEchoService.echo",
          AsyncRespondersFactory.requestResponse(
            asyncEchoService.handleEchoRequestResponse,
            codecs
          )
        );

        builder.route(
          "AsyncEchoService.hear",
          AsyncRespondersFactory.fireAndForget(
            asyncEchoService.handleHearFireAndForget,
            // TODO: aligning seconds argument to always `codecs` might be simpler
            //  even if only the input codec will be used
            codecs.inputCodec
          )
        );

        builder.route(
          "AsyncEchoService.echo",
          AsyncRespondersFactory.requestStream(
            asyncEchoService.handleEchoRequestStream,
            codecs
          )
        );

        builder.route(
          "RawEchoService.echo",
          DefaultRespondersFactory.requestStream(
            rawEchoService.handleEchoRequestStream,
            codecs
          )
        );

        return builder.build();
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

async function main() {
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();
  const requester = RSocketRequester.wrap(rsocket);

  const unknownRoute = "UnknownService.unknown";

  // this request will fail on the server but the client
  // will NOT be notified as per fireAndForget spec
  await requester
    .route("RxEchoService.echo")
    .request(AsyncRequestersFactory.fireAndForget("Hello World", stringCodec));

  Logger.info("[client] rx fireAndForget done");

  await requester
    .route("AsyncEchoService.hear")
    .request(AsyncRequestersFactory.fireAndForget("Hello World", stringCodec));

  Logger.info("[client] async fireAndForget done");

  let data;

  // this request will succeed
  data = await requester
    .route("RxEchoService.echo")
    .request(
      AsyncRequestersFactory.requestResponse(
        "Hello World",
        stringCodec,
        stringCodec
      )
    );

  Logger.info("[client] received:", data);

  // this request will succeed
  data = await requester
    .route("AsyncEchoService.echo")
    .request(
      AsyncRequestersFactory.requestResponse(
        "Hello World",
        stringCodec,
        stringCodec
      )
    );

  Logger.info("[client] requestResponse done", data);

  // this request will reject (unknown route)
  try {
    await requester
      // TODO: server responds with TypeError when passing `undefined` here.
      //  server should likely mask input errors
      .route(unknownRoute)
      .request(
        AsyncRequestersFactory.requestResponse(
          "Hello World",
          stringCodec,
          stringCodec
        )
      );
  } catch (e) {
    Logger.error("[client] requestResponse error", e);
  }

  const asyncServiceIterable = requester
    .route("AsyncEchoService.echo")
    .request(
      AsyncRequestersFactory.requestStream(
        "Hello World",
        stringCodec,
        stringCodec,
        3
      )
    );

  Logger.info("[client] requestStream to async iterable");

  for await (const value of asyncServiceIterable) {
    Logger.info(`[client] received`, value);
  }

  Logger.info("[client] requestStream to async iterable done");

  const rawServiceIterable = requester
    .route("RawEchoService.echo")
    .request(
      AsyncRequestersFactory.requestStream(
        "Hello World",
        stringCodec,
        stringCodec,
        3
      )
    );

  Logger.info("[client] requestStream to async iterable");

  for await (const value of rawServiceIterable) {
    Logger.info(`[client] received`, value);
  }

  Logger.info("[client] requestStream to async iterable done");
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
