import {
  ClientTransport,
  Flags,
  FrameTypes,
  Payload,
  RSocket,
  SetupFrame,
} from "@rsocket/rsocket-types";
import {
  ClientServerInputMultiplexerDemultiplexer,
  RSocketRequester,
} from "./ClientServerMultiplexerDemultiplexer";

export type Config = {
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

  constructor(config: Config) {
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

  async bind(): Promise<RSocket> {
    const connection = await this.transport.connect();

    const multiplexer = new ClientServerInputMultiplexerDemultiplexer(
      false,
      () => {},
      connection,
      0,
      () => 1,
      {}
    );

    connection.send(this.setupFrame);

    return new RSocketRequester(multiplexer);
  }
}
