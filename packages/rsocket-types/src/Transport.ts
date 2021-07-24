import { Closeable, Availability } from "./Common";
import { Frame } from "./Frames";

export interface Outbound {
  /**
   * Send a single frame on the connection.
   */
  send(s: Frame): void;
}

export interface FrameHandler {
  handle(frame: Frame): void;
}

export enum FlowControl {
  NEXT,
  ALL
}

export interface FlowControlledFrameHandler {
  handle(frame: Frame, callback?: (request: FlowControl) => void): void;
}

export interface Inbound {
  /**
   * Returns a stream of all `Frame`s received on this connection.
   *
   * Notes:
   * - Implementations must call `onComplete` if the underlying connection is
   *   closed by the peer or by calling `close()`.
   * - Implementations must call `onError` if there are any errors
   *   sending/receiving frames.
   * - Implemenations may optionally support multi-cast receivers. Those that do
   *   not should throw if `receive` is called more than once.
   */
  handle(handler: FlowControlledFrameHandler): void;
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface DuplexConnection extends Inbound, Outbound, Closeable, Availability {
}

export interface ClientTransport {
  connect(): Promise<DuplexConnection>
}
