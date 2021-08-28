import {
  ClientServerInputMultiplexerDemultiplexer,
  ResumableClientServerInputMultiplexerDemultiplexer,
  StreamIdGenerator,
} from "./ClientServerMultiplexerDemultiplexer";
import { Closeable } from "./Common";
import { ErrorCodes, RSocketError } from "./Errors";
import { Flags, FrameTypes } from "./Frames";
import { SocketAcceptor } from "./RSocket";
import {
  DefaultConnectionFrameHandler,
  DefaultStreamRequestHandler,
  KeepAliveHandler,
  KeepAliveSender,
  LeaseHandler,
  RSocketRequester,
} from "./RSocketSupport";
import { ServerTransport } from "./Transport";
import { FrameStore } from "./Resume";

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
    casheSize?: number;
    sessionTimeout: number;
  };
};

export class RSocketServer {
  private readonly transport: ServerTransport;
  private readonly acceptor: SocketAcceptor;
  private readonly serverSideKeepAlive: boolean;
  private readonly lease?: {
    maxPendingRequests?: number;
  };
  private readonly fragmentation?: {
    maxOutboundFragmentSize?: number;
  };
  private readonly sessionStore?: {
    [sessionId: string]: ResumableClientServerInputMultiplexerDemultiplexer;
  };
  private readonly sessionTimeout?: number;

  constructor(config: ServerConfig) {
    this.acceptor = config.acceptor;
    this.transport = config.transport;
    this.lease = config.lease;
    this.serverSideKeepAlive = config.serverSideKeepAlive;
    this.sessionStore = config.resume ? {} : undefined;
    this.sessionTimeout = config.resume?.sessionTimeout ?? undefined;
  }

  async bind(): Promise<Closeable> {
    return await this.transport.bind(
      async (frame, connection) => {
        switch (frame.type) {
          case FrameTypes.SETUP: {
            try {
              if (this.lease && !Flags.hasLease(frame.flags)) {
                const error = new RSocketError(
                  ErrorCodes.REJECTED_SETUP,
                  "Lease has to be enabled"
                );
                connection.multiplexerDemultiplexer.connectionOutbound.send({
                  type: FrameTypes.ERROR,
                  streamId: 0,
                  flags: Flags.NONE,
                  code: error.code,
                  message: error.message,
                });
                connection.close(error);
                return;
              }
              if (Flags.hasLease(frame.flags) && !this.lease) {
                const error = new RSocketError(
                  ErrorCodes.REJECTED_SETUP,
                  "Lease has to be disabled"
                );
                connection.multiplexerDemultiplexer.connectionOutbound.send({
                  type: FrameTypes.ERROR,
                  streamId: 0,
                  flags: Flags.NONE,
                  code: error.code,
                  message: error.message,
                });
                connection.close(error);
                return;
              }

              const leaseHandler = Flags.hasLease(frame.flags)
                ? new LeaseHandler(
                    this.lease.maxPendingRequests ?? 256,
                    connection.multiplexerDemultiplexer
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
                    connection.multiplexerDemultiplexer.connectionOutbound,
                    frame.keepAlive
                  )
                : undefined;
              const connectionFrameHandler = new DefaultConnectionFrameHandler(
                connection,
                keepAliveHandler,
                keepAliveSender,
                leaseHandler,
                responder
              );
              const streamsHandler = new DefaultStreamRequestHandler(
                responder,
                0
              );

              connection.onClose((e) => {
                keepAliveSender?.close();
                keepAliveHandler.close();
                connectionFrameHandler.close(e);
              });
              connection.multiplexerDemultiplexer.connectionInbound(
                connectionFrameHandler
              );
              connection.multiplexerDemultiplexer.handleRequestStream(
                streamsHandler
              );

              keepAliveHandler.start();
              keepAliveSender?.start();
            } catch (e) {
              connection.multiplexerDemultiplexer.connectionOutbound.send({
                type: FrameTypes.ERROR,
                streamId: 0,
                code: ErrorCodes.REJECTED_SETUP,
                message: e.message ?? "",
                flags: Flags.NONE,
              });
              connection.close(
                e instanceof RSocketError
                  ? e
                  : new RSocketError(ErrorCodes.REJECTED_SETUP, e.message)
              );
            }
            return;
          }
          case FrameTypes.RESUME: {
            // frame should be handled earlier
            return;
          }
          default: {
            connection.multiplexerDemultiplexer.connectionOutbound.send({
              type: FrameTypes.ERROR,
              streamId: 0,
              code: ErrorCodes.UNSUPPORTED_SETUP,
              message: "Unsupported setup",
              flags: Flags.NONE,
            });

            connection.close(new RSocketError(ErrorCodes.UNSUPPORTED_SETUP));
          }
        }
      },
      (frame, outbound) => {
        if (frame.type === FrameTypes.RESUME) {
          if (this.sessionStore) {
            const multiplexerDemultiplexer = this.sessionStore[
              frame.resumeToken.toString()
            ];

            if (!multiplexerDemultiplexer) {
              outbound.send({
                type: FrameTypes.ERROR,
                streamId: 0,
                code: ErrorCodes.REJECTED_RESUME,
                message: "No session found for the given resume token",
                flags: Flags.NONE,
              });

              outbound.close();

              return;
            }

            multiplexerDemultiplexer.resume(frame, outbound, outbound);

            return multiplexerDemultiplexer;
          }

          outbound.send({
            type: FrameTypes.ERROR,
            streamId: 0,
            code: ErrorCodes.REJECTED_RESUME,
            message: "Resume is not enabled",
            flags: Flags.NONE,
          });

          outbound.close();

          return;
        } else if (frame.type === FrameTypes.SETUP) {
          if (Flags.hasResume(frame.flags)) {
            if (!this.sessionStore) {
              const error = new RSocketError(
                ErrorCodes.REJECTED_SETUP,
                "No resume support"
              );
              outbound.send({
                type: FrameTypes.ERROR,
                streamId: 0,
                flags: Flags.NONE,
                code: error.code,
                message: error.message,
              });
              outbound.close(error);
              return;
            }
            const multiplexerDumiltiplexer = new ResumableClientServerInputMultiplexerDemultiplexer(
              StreamIdGenerator.create(0),
              outbound,
              outbound,
              new FrameStore(), // TODO: add size parameter
              frame.resumeToken.toString(),
              this.sessionStore,
              this.sessionTimeout
            );

            this.sessionStore[
              frame.resumeToken.toString()
            ] = multiplexerDumiltiplexer;

            return multiplexerDumiltiplexer;
          }
        }

        return new ClientServerInputMultiplexerDemultiplexer(
          StreamIdGenerator.create(0),
          outbound,
          outbound
        );
      }
    );
  }
}
