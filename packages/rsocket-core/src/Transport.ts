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
  add(handler: StreamFrameHandler): void;
  remove(handler: StreamFrameHandler): void;
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
}

export interface StreamLifecycleHandler {
  handleReady(streamId: number, stream: Outbound & Stream): boolean;
  handleReject(error: Error): void;
}

export interface StreamFrameHandler extends FrameHandler {
  readonly streamId: number;
  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void;
  close(error?: Error): void;
}

export interface Multiplexer {
  readonly connectionOutbound: Outbound;
  createStream(
    handler: StreamFrameHandler & StreamLifecycleHandler,
    streamType:
      | FrameTypes.REQUEST_FNF
      | FrameTypes.REQUEST_RESPONSE
      | FrameTypes.REQUEST_STREAM
      | FrameTypes.REQUEST_CHANNEL
  ): void;
}

export interface Demultiplexer {
  handleConnectionFrames(
    handler: (
      frame:
        | SetupFrame
        | ResumeFrame
        | ResumeOkFrame
        | LeaseFrame
        | KeepAliveFrame
        | ErrorFrame
        | MetadataPushFrame
    ) => void
  ): void;

  handleStream(
    handler: (
      frame:
        | RequestFnfFrame
        | RequestResponseFrame
        | RequestStreamFrame
        | RequestChannelFrame,
      stream: Outbound & Stream
    ) => boolean
  ): void;
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface DuplexConnection extends Closeable, Availability {
  readonly multiplexer: Multiplexer;
  readonly demultiplexer: Demultiplexer;
}

export interface ClientTransport {
  connect(): Promise<DuplexConnection>;
}

export interface ServerTransport {
  bind(
    connectionAcceptor: (
      frame: Frame,
      connection: DuplexConnection
    ) => Promise<void>
  ): Promise<Closeable>;
}
