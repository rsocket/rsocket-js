import {
  ClientServerInputMultiplexerDemultiplexer,
  StreamIdGenerator,
} from "./ClientServerMultiplexerDemultiplexer";
import { Flags, FrameTypes, SetupFrame } from "./Frames";
import { Payload, RSocket } from "./RSocket";
import {
  ConnectionFrameHandler,
  KeepAliveHandler,
  KeepAliveSender,
  LeaseHandler,
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
  fragmentation?: {
    maxOutboundFragmentSize?: number;
  };
  transport: ClientTransport;
  responder?: Partial<RSocket>;
  lease?: {
    maxPendingRequests?: number;
  };
  resume?: {
    casheSize: number;
  };
};

export class RSocketConnector {
  private setupFrame: SetupFrame;
  private transport: ClientTransport;
  private responder: Partial<RSocket>;
  private lease?: {
    maxPendingRequests?: number;
  };
  private fragmentation?: {
    maxOutboundFragmentSize?: number;
  };

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
      flags:
        (config.setup?.payload?.metadata ? Flags.METADATA : Flags.NONE) |
        (config.lease ? Flags.LEASE : Flags.NONE),
    };
    this.responder = config.responder ?? {};
    this.transport = config.transport;
    this.lease = config.lease;
  }

  async connect(): Promise<RSocket> {
    const connection = await this.transport.connect(
      (outbound) =>
        new ClientServerInputMultiplexerDemultiplexer(
          StreamIdGenerator.create(-1),
          outbound
        )
    );
    const keepAliveSender = new KeepAliveSender(
      connection.multiplexerDemultiplexer.connectionOutbound,
      this.setupFrame.keepAlive
    );
    const keepAliveHandler = new KeepAliveHandler(
      connection,
      this.setupFrame.lifetime
    );
    const leaseHandler: LeaseHandler = this.lease
      ? new LeaseHandler(
          this.lease.maxPendingRequests ?? 256,
          connection.multiplexerDemultiplexer
        )
      : undefined;
    const connectionFrameHandler = new ConnectionFrameHandler(
      connection,
      keepAliveHandler,
      leaseHandler,
      this.responder
    );
    const streamsHandler = new StreamHandler(this.responder, 0);

    connection.onClose((e) => {
      keepAliveSender.close();
      keepAliveHandler.close();
      connectionFrameHandler.close(e);
    });
    connection.multiplexerDemultiplexer.connectionInbound(
      connectionFrameHandler.handle.bind(connectionFrameHandler)
    );
    connection.multiplexerDemultiplexer.handleRequestStream(
      streamsHandler.handle.bind(connectionFrameHandler)
    );
    connection.multiplexerDemultiplexer.connectionOutbound.send(
      this.setupFrame
    );
    keepAliveHandler.start();
    keepAliveSender.start();

    return new RSocketRequester(
      connection,
      this.fragmentation?.maxOutboundFragmentSize ?? 0,
      leaseHandler
    );
  }
}
