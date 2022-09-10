const { RSocketServer } = require("rsocket-core");
const { WebsocketServerTransport } = require("rsocket-websocket-server");
const WebSocket = require("ws");

const port = 9090;

const server = new RSocketServer({
  transport: new WebsocketServerTransport({
    wsCreator: (options) => {
      return new WebSocket.Server({
        port: port,
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

(async () => {
  await server.bind();
  console.log(`Server listening on port ${port}`);
})();
