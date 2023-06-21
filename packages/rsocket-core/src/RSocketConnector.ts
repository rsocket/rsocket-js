/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Closeable, DuplexConnection, Outbound } from ".";
import {
  ClientServerInputMultiplexerDemultiplexer,
  ResumableClientServerInputMultiplexerDemultiplexer,
  ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer,
  StreamIdGenerator,
} from "./ClientServerMultiplexerDemultiplexer";
import { Flags, FrameTypes, SetupFrame } from "./Frames";
import { Payload, RSocket } from "./RSocket";
import {
  DefaultConnectionFrameHandler,
  DefaultStreamRequestHandler,
  KeepAliveHandler,
  KeepAliveSender,
  LeaseHandler,
  RSocketRequester,
} from "./RSocketSupport";
import { ClientTransport } from "./Transport";
import { FrameStore } from "./Resume";

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
    cacheSize?: number;
    tokenGenerator: () => Buffer;
    reconnectFunction: (attempt: number) => Promise<void>;
  };
};

export class RSocketConnector {
  private readonly config: ConnectorConfig;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  async connect(): Promise<RSocket> {
    const config = this.config;
    const setupFrame: SetupFrame = {
      type: FrameTypes.SETUP,
      dataMimeType: config.setup?.dataMimeType ?? "application/octet-stream",
      metadataMimeType:
        config.setup?.metadataMimeType ?? "application/octet-stream",
      keepAlive: config.setup?.keepAlive ?? 60000,
      lifetime: config.setup?.lifetime ?? 300000,
      metadata: config.setup?.payload?.metadata,
      data: config.setup?.payload?.data,
      resumeToken: config.resume?.tokenGenerator() ?? null,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 0,
      flags:
        (config.setup?.payload?.metadata ? Flags.METADATA : Flags.NONE) |
        (config.lease ? Flags.LEASE : Flags.NONE) |
        (config.resume ? Flags.RESUME_ENABLE : Flags.NONE),
    };
    const connection = await config.transport.connect((outbound) => {
      return config.resume
        ? new ResumableClientServerInputMultiplexerDemultiplexer(
            StreamIdGenerator.create(-1),
            outbound,
            outbound,
            new FrameStore(), // TODO: add size control
            setupFrame.resumeToken.toString(),
            async (self, frameStore) => {
              const multiplexerDemultiplexerProvider = (
                outbound: Outbound & Closeable
              ) => {
                outbound.send({
                  type: FrameTypes.RESUME,
                  streamId: 0,
                  flags: Flags.NONE,
                  clientPosition: frameStore.firstAvailableFramePosition,
                  serverPosition: frameStore.lastReceivedFramePosition,
                  majorVersion: setupFrame.minorVersion,
                  minorVersion: setupFrame.majorVersion,
                  resumeToken: setupFrame.resumeToken,
                });
                return new ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer(
                  outbound,
                  outbound,
                  self
                );
              };
              let reconnectionAttempts = -1;
              const reconnector: () => Promise<DuplexConnection> = () => {
                reconnectionAttempts++;
                return config.resume
                  .reconnectFunction(reconnectionAttempts)
                  .then(() =>
                    config.transport
                      .connect(multiplexerDemultiplexerProvider)
                      .catch(reconnector)
                  );
              };

              await reconnector();
            }
          )
        : new ClientServerInputMultiplexerDemultiplexer(
            StreamIdGenerator.create(-1),
            outbound,
            outbound
          );
    });
    const keepAliveSender = new KeepAliveSender(
      connection.multiplexerDemultiplexer.connectionOutbound,
      setupFrame.keepAlive
    );
    const keepAliveHandler = new KeepAliveHandler(
      connection,
      setupFrame.lifetime
    );
    const leaseHandler: LeaseHandler = config.lease
      ? new LeaseHandler(
          config.lease.maxPendingRequests ?? 256,
          connection.multiplexerDemultiplexer
        )
      : undefined;
    const responder = config.responder ?? {};
    const connectionFrameHandler = new DefaultConnectionFrameHandler(
      connection,
      keepAliveHandler,
      keepAliveSender,
      leaseHandler,
      responder
    );
    const streamsHandler = new DefaultStreamRequestHandler(responder, 0);

    connection.onClose((e) => {
      keepAliveSender.close();
      keepAliveHandler.close();
      connectionFrameHandler.close(e);
    });
    connection.multiplexerDemultiplexer.connectionInbound(
      connectionFrameHandler
    );
    connection.multiplexerDemultiplexer.handleRequestStream(streamsHandler);
    connection.multiplexerDemultiplexer.connectionOutbound.send(setupFrame);
    keepAliveHandler.start();
    keepAliveSender.start();

    return new RSocketRequester(
      connection,
      config.fragmentation?.maxOutboundFragmentSize ?? 0,
      leaseHandler
    );
  }
}
