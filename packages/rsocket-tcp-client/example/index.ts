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
    const setupFrame = SetupFrame({
      dataMimeType: "text/plain",
      metadataMimeType: "text/plain",
      keepAlive: 10000,
      lifetime: 10000,
    });
    console.log("Sending setup frame...");
    transport.sendOne(setupFrame);
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }
};

run();
