import {
  // OnExtensionSubscriber,
  // OnNextSubscriber,
  // OnTerminalSubscriber,
  // Payload,
  RSocketConnector,
} from "@rsocket/core";
import { WebsocketClientTransport } from "@rsocket/transport-websocket-client";

describe("WebsocketClientTransport", () => {
  it("sanity check", () => {
    expect(1 + 2).to.be(3);
  });

  // TODO: test that actually connects and exercises WS and Buffer impl
  // it("can be used in a browser environment", async () => {
  //   const connector = new RSocketConnector({
  //     transport: new WebsocketClientTransport({
  //       url: "ws://localhost:9090",
  //       wsCreator: (url) => new WebSocket(url) as any,
  //     }),
  //   });
  //
  //   await connector.connect();
  // });
});
