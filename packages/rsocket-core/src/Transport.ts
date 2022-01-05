import { Availability, Closeable } from "./Common";
import {
  CancelFrame,
  ErrorFrame,
  ExtFrame,
  Frame,
  FrameTypes,
  KeepAliveFrame,
  LeaseFrame,
  MetadataPushFrame,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
  ResumeFrame,
  ResumeOkFrame,
  SetupFrame,
} from "./Frames";

export interface Outbound {
  /**
   * Send a single frame on the connection.
   */
  send(s: Frame): void;
}

export interface Stream extends Outbound {
  connect(handler: StreamFrameHandler): void;

  disconnect(handler: StreamFrameHandler): void;

  send(
    frame:
      | CancelFrame
      | ErrorFrame
      | PayloadFrame
      | RequestChannelFrame
      | RequestFnfFrame
      | RequestNFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | ExtFrame
  ): void;
}

export interface FrameHandler {
  handle(frame: Frame): void;
  close(error?: Error): void;
}

export interface ConnectionFrameHandler extends FrameHandler {
  handle(
    frame:
      | SetupFrame
      | ResumeFrame
      | ResumeOkFrame
      | LeaseFrame
      | KeepAliveFrame
      | ErrorFrame
      | MetadataPushFrame
  ): void;

  pause(): void;
  resume(): void;
}

export interface StreamRequestHandler extends FrameHandler {
  handle(
    frame:
      | RequestFnfFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | RequestChannelFrame,
    stream?: Stream
  ): void;
}

export interface StreamLifecycleHandler {
  handleReady(streamId: number, stream: Outbound & Stream): boolean;

  handleReject(error: Error): void;
}

export interface StreamFrameHandler extends FrameHandler {
  readonly streamType:
    | FrameTypes.REQUEST_CHANNEL
    | FrameTypes.REQUEST_FNF
    | FrameTypes.REQUEST_RESPONSE
    | FrameTypes.REQUEST_STREAM;
  readonly streamId: number;

  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void;
}

export interface Multiplexer {
  readonly connectionOutbound: Outbound;

  createRequestStream(
    streamHandler: StreamFrameHandler & StreamLifecycleHandler
  ): void;
}

export interface Demultiplexer {
  connectionInbound(handler: ConnectionFrameHandler): void;

  handleRequestStream(handler: StreamRequestHandler): void;
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface DuplexConnection extends Closeable, Availability {
  readonly multiplexerDemultiplexer: Multiplexer & Demultiplexer;
}

export interface ClientTransport {
  connect(
    multiplexerDemultiplexerFactory: (
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<DuplexConnection>;
}

export interface ServerTransport {
  bind(
    connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>,
    multiplexerDemultiplexerFactory: (
      frame: Frame,
      outbound: Outbound & Closeable
    ) => Multiplexer & Demultiplexer & FrameHandler
  ): Promise<Closeable>;
}
