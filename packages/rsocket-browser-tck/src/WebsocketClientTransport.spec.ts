import { RSocketConnector } from "@rsocket/core";
import { WebsocketClientTransport } from "@rsocket/transport-websocket-client";

// const Buffer = require("buffer/").Buffer;

// window.Buffer = Buffer;

describe("WebsocketClientTransport", () => {
  describe("connector", function () {
    it("connect", async () => {
      const url = "ws://localhost:9091";
      const connector = new RSocketConnector({
        transport: new WebsocketClientTransport({
          url,
        }),
      });
      const rsocket = await connector.connect();
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 80);
      });
      await rsocket.close();
    });
  });
});
