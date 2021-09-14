import {
  ErrorCodes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketConnector,
  RSocketError,
  RSocketServer,
} from "@rsocket/rsocket-core";
import { WebsocketClientTransport } from "@rsocket/rsocket-websocket-client";
import { WebsocketServerTransport } from "@rsocket/rsocket-websocket-server";
import { exit } from "process";
import WebSocket from "ws";
import {
  encoderDecoderPipelineExtension,
  JsonDataMapper,
} from "@rsocket/rsocket-extension-encoder-decoder-pipeline";
import Logger from "./shared/logger";
import {
  decodeCompositeMetadata,
  decodeRoutes,
  WellKnownMimeType,
} from "@rsocket/rsocket-composite-metadata";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;

function makeServer() {
  function mapMetaData(payload: Payload) {
    const mappedMetaData = new Map<string, any>();
    if (payload.metadata) {
      const decodedCompositeMetaData = decodeCompositeMetadata(
        payload.metadata
      );

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
          fireAndForget: (payload: Payload, responderStream) => {
            const mappedMetaData = mapMetaData(payload);
            const route = mappedMetaData.get(
              MESSAGE_RSOCKET_ROUTING.toString()
            );
            switch (route) {
              case "MetricsService.ingest": {
                Logger.info("MetricsService.ingest request", payload);
                return {
                  cancel: () => {
                    Logger.info("MetricsService.ingest cancelled");
                  },
                  onExtension: () => {
                    Logger.info("MetricsService.ingest extension request");
                  },
                };
              }

              default: {
                Logger.error("The encoded route was unknown by the server.", {
                  route: route,
                });
                responderStream.onError(
                  new RSocketError(
                    ErrorCodes.REJECTED,
                    "The encoded route was unknown by the server."
                  )
                );
                return {
                  cancel: () => {
                    Logger.info("unknown fnf cancelled");
                  },
                  onExtension: () => {
                    Logger.info("unknown fnf request extended");
                  },
                };
              }
            }
          },
          requestResponse: (
            payload: Payload,
            responderStream: OnTerminalSubscriber &
              OnNextSubscriber &
              OnExtensionSubscriber
          ) => {
            const mappedMetaData = mapMetaData(payload);
            const route = mappedMetaData.get(
              MESSAGE_RSOCKET_ROUTING.toString()
            );
            switch (route) {
              case "EchoService.echo": {
                Logger.info("EchoService.echo request", payload);
                const timeout = setTimeout(
                  () =>
                    responderStream.onNext(
                      {
                        data: Buffer.from(
                          JSON.stringify({
                            echo: JSON.parse(payload.data.toString()),
                          })
                        ),
                      },
                      true
                    ),
                  500
                );
                return {
                  cancel: () => {
                    Logger.info("EchoService.echo cancelled");
                    clearTimeout(timeout);
                  },
                  onExtension: () => {
                    Logger.info("EchoService.echo extension request");
                  },
                };
              }

              default: {
                Logger.error("The encoded route was unknown by the server.", {
                  route: route,
                });
                responderStream.onError(
                  new RSocketError(
                    ErrorCodes.REJECTED,
                    "The encoded route was unknown by the server."
                  )
                );
                return {
                  cancel: () => {
                    Logger.info("unknown request response cancelled");
                  },
                  onExtension: () => {
                    Logger.info("unknown request response request extended");
                  },
                };
              }
            }
          },
        };
      },
    },
  });
}

async function main() {
  const server = makeServer();

  const connector = new RSocketConnector({
    transport: new WebsocketClientTransport({
      url: "ws://localhost:8080",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });

  const serverCloseable = await server.bind();

  const rsocket = encoderDecoderPipelineExtension(await connector.connect());

  const jsonDataMapper = new JsonDataMapper();

  await new Promise((resolve, reject) => {
    let fnfCancellable = rsocket
      .fireAndForget({ date: new Date().toISOString(), value: 1 })
      .encoder()
      .route("MetricsService.ingest")
      .mapData(jsonDataMapper)
      .and()
      .responder({
        onComplete(): void {
          setTimeout(() => {
            resolve(null);
          }, 1000);
        },
        onError(error: Error): void {
          Logger.error("fnf failed:", error);
          reject(error);
        },
      })
      .exec();
  });

  await new Promise((resolve, reject) => {
    let reqResCancellable = rsocket
      .requestResponse({ name: "scuba steve" })
      .encoder()
      .route("EchoService.echo")
      .mapData(jsonDataMapper)
      .and()
      .decoder()
      .mapData(jsonDataMapper)
      .and()
      .responder({
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          Logger.info("EchoService.echo response", {
            data: payload.data,
            metadata: payload.metadata,
            isComplete,
          });
          resolve(payload);
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
      })
      .exec();
  });

  serverCloseable.close();
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  });
