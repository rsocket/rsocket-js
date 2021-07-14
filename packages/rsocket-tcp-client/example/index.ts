/* eslint-disable no-console */
import RSocketTcpClient from "../src/RSocketTcpClient";
import { RSocketFrameFactories } from "@rsocket/rsocket-core";

// eslint-disable-next-line consistent-return
const run = async () => {

  const connectionOptions = {
    host: "localhost",
    port: 9090,
  };
  let transport = null;

  try {
    transport = await new RSocketTcpClient(connectionOptions).connect();
    console.log("TCP connection established...");
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }

  const setupFrame = RSocketFrameFactories.CreateSetupFrame();
  transport.sendOne(setupFrame);
};

run();
