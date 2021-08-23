import { Flags, FrameTypes, SetupFrame } from "./Frames";
import { Payload, RSocket } from "./RSocket";
import {
  ConnectionFrameHandler,
  KeepAliveHandler,
  KeepAliveSender,
  RSocketRequester,
  StreamHandler,
} from "./RSocketSupport";
import { ClientTransport } from "./Transport";

export type ConnectorConfig = {
  setup?: {
    payload?: Payload;
    dataMimeType?: string;
    metadataMimeType?: string;
    keepAlive?: number;
    lifetime?: number;
  };
  transport: ClientTransport;
  responder?: Partial<RSocket>;
  lease?: {};
  resume?: {};
};

export class RSocketConnector {
  private setupFrame: SetupFrame;
  private transport: ClientTransport;
  private responder: Partial<RSocket>;

  constructor(config: ConnectorConfig) {
    this.setupFrame = {
      type: FrameTypes.SETUP,
      dataMimeType: config.setup?.dataMimeType ?? "application/octet-stream",
      metadataMimeType:
        config.setup?.metadataMimeType ?? "application/octet-stream",
      keepAlive: config.setup?.keepAlive ?? 60000,
      lifetime: config.setup?.lifetime ?? 300000,
      metadata: config.setup?.payload?.metadata,
      data: config.setup?.payload?.data,
      resumeToken: null,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 0,
      flags: config.setup?.payload?.metadata ? Flags.METADATA : Flags.NONE,
    };
    this.responder = config.responder ?? {};
    this.transport = config.transport;
  }

  async connect(): Promise<RSocket> {
    const connection = await this.transport.connect();
    const keepAliveSender = new KeepAliveSender(
      connection.multiplexer.connectionOutbound,
      this.setupFrame.keepAlive
    );
    const keepAliveHandler = new KeepAliveHandler(
      connection,
      this.setupFrame.lifetime
    );
    const connectionFrameHandler = new ConnectionFrameHandler(
      connection,
      keepAliveHandler,
      this.responder
    );
    const streamsHandler = new StreamHandler(this.responder, 0);

    connection.onClose((e) => {
      keepAliveSender.close();
      keepAliveHandler.close();
      connectionFrameHandler.close(e);
    });
    connection.demultiplexer.handleConnectionFrames(
      connectionFrameHandler.handle.bind(connectionFrameHandler)
    );
    connection.demultiplexer.handleStream(
      streamsHandler.handle.bind(connectionFrameHandler)
    );
    connection.multiplexer.connectionOutbound.send(this.setupFrame);
    keepAliveHandler.start();
    keepAliveSender.start();

    return new RSocketRequester(connection, 0);
  }
}
