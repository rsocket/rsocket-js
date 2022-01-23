const path = require("path");
const karma = require("karma");
const { RSocketServer } = require("@rsocket/core");
const {
  WebsocketServerTransport,
} = require("@rsocket/transport-websocket-server");
const WebSocket = require("ws");
const parseConfig = karma.config.parseConfig;
const Server = karma.Server;

const rsocketServerPort = 9091;
const rSocketServer = new RSocketServer({
  transport: new WebsocketServerTransport({
    wsCreator: (options) => {
      return new WebSocket.Server({
        port: rsocketServerPort,
      });
    },
  }),
  acceptor: {
    accept: async () => ({
      requestResponse: (payload, responderStream) => {
        const timeout = setTimeout(
          () =>
            responderStream.onNext(
              {
                data: Buffer.concat([Buffer.from("Echo: "), payload.data]),
              },
              true
            ),
          80
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

let karmaServer = null;
let karmaConfig = null;
let rSocketServerClosable = null;
parseConfig(
  path.resolve("./karma.conf.js"),
  { port: 9876 },
  { promiseConfig: true, throwErrors: true }
)
  .then(async (_karmaConfig) => {
    rSocketServerClosable = await rSocketServer.bind();
    console.log(`RSocket Server started on port ${rsocketServerPort}`);
    karmaConfig = _karmaConfig;
    karmaServer = new Server(_karmaConfig, async function doneCallback(
      exitCode
    ) {
      console.log(`Karma exited with code: ${exitCode}`);
      await rSocketServerClosable.close();
      process.exit(exitCode);
    });
    return karmaServer.start();
  })
  .catch((rejectReason) => {
    console.error(rejectReason);
    process.exit(1);
  });
