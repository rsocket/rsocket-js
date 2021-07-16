/* eslint-disable no-console */
import RSocketTcpClient from "../src/RSocketTcpClient";
import { RSocketFrameFactory } from "@rsocket/rsocket-core";

// eslint-disable-next-line consistent-return
const run = async () => {
  const connectionOptions = {
    host: "localhost",
    port: 9090,
  };

  const transport = new RSocketTcpClient(connectionOptions);

  try {
    await transport.connect();
    console.log("TCP connection established...");
    const factories = RSocketFrameFactory();
    const { SetupFrame } = factories;
    const setupPayload = {
      data: "hello world",
    };
    const setupFrame = SetupFrame({
      dataMimeType: "text/plain",
      metadataMimeType: "text/plain",
      payload: setupPayload,
      keepAlive: 1000000,
      lifetime: 100000,
    });
    console.log("Sending setup frame...", setupPayload);
    transport.sendOne(setupFrame);
    console.log("Setup frame sent...");
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }
};

run();
