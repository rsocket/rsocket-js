import {
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocketServer,
} from "@rsocket/rsocket-core";
import { WebsocketServerTransport } from "@rsocket/rsocket-websocket-server";
import WebSocket from "ws";
import Logger from "../shared/logger";

const fireAndForgetHandler = (payload: Payload) => {
  Logger.info(
    `[server] [fireAndForgetHandler] payload[data: ${payload.data}; metadata: ${payload.metadata}]`
  );
  return {
    cancel: () => {
      Logger.info("[server] stream cancelled by client");
    },
  };
};

const requestResponseHandler = (
  payload: Payload,
  responderStream: OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber
) => {
  Logger.info(
    `[server] [requestResponse] payload[data: ${payload.data}; metadata: ${payload.metadata}]`
  );
  responderStream.onNext(
    {
      data: Buffer.concat([Buffer.from("Echo: "), payload.data]),
    },
    true
  );
  return {
    cancel() {
      Logger.info("[server] [requestResponse] stream cancelled by client");
    },
    onExtension: () => {
      Logger.info("[server] [requestResponse] Received Extension request");
    },
  };
};

const requestStreamHandler = (
  payload: Payload,
  initialRequestN,
  responderStream: OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber
) => {
  Logger.info(
    `[server] [requestStream] payload[data: ${payload.data}; metadata: ${payload.metadata}]|initialRequestN: ${initialRequestN}`
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
      Logger.info("[server] [requestStream] stream cancelled by client");
      clearInterval(interval);
    },
    request(n) {
      requestedResponses += n;
      Logger.info(
        `[server] [requestStream] request n: ${n}, requestedResponses: ${requestedResponses}, sentResponses: ${sentResponses}`
      );
    },
    onExtension: () => {},
  };
};

export function makeServer() {
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
          fireAndForget: fireAndForgetHandler,
          requestResponse: requestResponseHandler,
          requestStream: requestStreamHandler,
        };
      },
    },
  });
}
