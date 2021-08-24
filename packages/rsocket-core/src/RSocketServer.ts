import { ErrorCodes, FrameTypes, RSocketError } from ".";
import { Closeable } from "./Common";
import { SocketAcceptor } from "./RSocket";
import {
  ConnectionFrameHandler,
  KeepAliveHandler,
  KeepAliveSender,
  RSocketRequester,
  StreamHandler,
} from "./RSocketSupport";
import { ServerTransport } from "./Transport";

export type ServerConfig = {
  transport: ServerTransport;
  acceptor: SocketAcceptor;
  serverSideKeepAlive?: boolean;
  lease?: {};
  resume?: {};
};

export class RSocketServer {
  private transport: ServerTransport;
  private acceptor: SocketAcceptor;
  private serverSideKeepAlive: boolean;

  constructor(config: ServerConfig) {
    this.acceptor = config.acceptor;
    this.transport = config.transport;
    this.serverSideKeepAlive = config.serverSideKeepAlive;
  }

  async bind(): Promise<Closeable> {
    return await this.transport.bind(async (frame, connection) => {
      switch (frame.type) {
        case FrameTypes.SETUP: {
          try {
            const requester = new RSocketRequester(connection, 0);
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
              streamsHandler.handle.bind(connectionFrameHandler)
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
