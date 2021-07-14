/* eslint-disable no-console */
import RSocketTcpClient from "../src/RSocketTcpClient";
import { RSocketFrameFactories } from "@rsocket/rsocket-core";

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
    const setupFrame = RSocketFrameFactories.CreateSetupFrame();
    transport.sendOne(setupFrame);
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }
};

run();
