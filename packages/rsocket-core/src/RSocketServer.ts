import { ErrorCodes, Flags, FrameTypes, RSocketError } from ".";
import { Closeable } from "./Common";
import { SocketAcceptor } from "./RSocket";
import {
  ConnectionFrameHandler,
  KeepAliveHandler,
  KeepAliveSender,
  LeaseHandler,
  RSocketRequester,
  StreamHandler,
} from "./RSocketSupport";
import { ServerTransport } from "./Transport";

export type ServerConfig = {
  transport: ServerTransport;
  acceptor: SocketAcceptor;
  serverSideKeepAlive?: boolean;
  fragmentation?: {
    maxOutboundFragmentSize?: number;
  };
  lease?: {
    maxPendingRequests?: number;
  };
  resume?: {
    casheSize: number;
  };
};

export class RSocketServer {
  private transport: ServerTransport;
  private acceptor: SocketAcceptor;
  private serverSideKeepAlive: boolean;
  private lease?: {
    maxPendingRequests?: number;
  };
  private fragmentation?: {
    maxOutboundFragmentSize?: number;
  };

  constructor(config: ServerConfig) {
    this.acceptor = config.acceptor;
    this.transport = config.transport;
    this.lease = config.lease;
    this.serverSideKeepAlive = config.serverSideKeepAlive;
  }

  async bind(): Promise<Closeable> {
    return await this.transport.bind(async (frame, connection) => {
      switch (frame.type) {
        case FrameTypes.SETUP: {
          try {
            if (this.lease && !Flags.hasLease(frame.flags)) {
              connection.close(
                new RSocketError(
                  ErrorCodes.REJECTED_SETUP,
                  "Lease has to be enabled"
                )
              );
              return;
            }
            if (Flags.hasLease(frame.flags) && !this.lease) {
              connection.close(
                new RSocketError(
                  ErrorCodes.REJECTED_SETUP,
                  "Lease has to be disabled"
                )
              );
              return;
            }
            const leaseHandler = Flags.hasLease(frame.flags)
              ? new LeaseHandler(
                  this.lease.maxPendingRequests ?? 256,
                  connection
                )
              : undefined;
            const requester = new RSocketRequester(
              connection,
              this.fragmentation?.maxOutboundFragmentSize ?? 0,
              leaseHandler
            );
            const responder = await this.acceptor.accept(
              {
                data: frame.data,
                dataMimeType: frame.dataMimeType,
                metadata: frame.metadata,
                metadataMimeType: frame.metadataMimeType,
                flags: frame.flags,
                keepAliveMaxLifetime: frame.lifetime,
                keepAliveInterval: frame.keepAlive,
                resumeToken: frame.resumeToken,
              },
              requester
            );
            const keepAliveHandler = new KeepAliveHandler(
              connection,
              frame.lifetime
            );
            const keepAliveSender = this.serverSideKeepAlive
              ? new KeepAliveSender(
                  connection.connectionOutbound,
                  frame.keepAlive
                )
              : undefined;
            const connectionFrameHandler = new ConnectionFrameHandler(
              connection,
              keepAliveHandler,
              leaseHandler,
              responder
            );
            const streamsHandler = new StreamHandler(responder, 0);

            connection.onClose((e) => {
              keepAliveSender?.close();
              keepAliveHandler.close();
              connectionFrameHandler.close(e);
            });
            connection.connectionInbound(
              connectionFrameHandler.handle.bind(connectionFrameHandler)
            );
            connection.handleRequestStream(
              streamsHandler.handle.bind(streamsHandler)
            );

            keepAliveHandler.start();
            keepAliveSender?.start();
          } catch (e) {
            connection.close(
              e instanceof RSocketError
                ? e
                : new RSocketError(ErrorCodes.REJECTED_SETUP, e.message)
            );
          }
          return;
        }
        default: {
          connection.close(new RSocketError(ErrorCodes.UNSUPPORTED_SETUP));
        }
      }
    });
  }
}
