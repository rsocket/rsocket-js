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
} from "@rsocket/core";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";
import { Codec, Flux, Mono, RSocketRequester } from "@rsocket/rsocket-requester";
import { Observable, firstValueFrom } from "rxjs";
import {
  decodeCompositeMetadata,
  decodeRoutes,
  encodeCompositeMetadata,
  encodeRoute,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";
import { exit } from "process";
import Logger from "../shared/logger";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;
import { RxRequestFactory } from "packages/rsocket-adapter-rxjs/dist";

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

async function requestResponse(
  rsocket: RSocketRequester<
    String,
    Observable<String> & Flux<String>,
    String,
    Observable<void> & Mono<void>,
    Observable<String> & Flux<String>,
    Observable<String> & Flux<String>
  >,
  route: string = ""
) {
  
  return firstValueFrom(rsocket.route(route).requestResponse("Hello World"));
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

const stringCodec = new StringCodec()

async function main() {
  const server = makeServer();
  const connector = makeConnector();

  serverCloseable = await server.bind();
  const rsocket = await connector.connect();
  const requester = new RSocketRequester(rsocket,  {
    inputCodec : stringCodec,
    outputCodec : stringCodec,
  }, RxRequestFactory.instance());

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
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });

