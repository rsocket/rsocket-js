import { Closeable } from "./Common";
import {
  CancelFrame,
  ErrorFrame,
  ExtFrame,
  PayloadFrame,
  RequestNFrame,
} from "./Frames";
import { FrameHandler, Outbound } from "./Transport";

/**
 * A single unit of data exchanged between the peers of a `RSocket`.
 */
export type Payload = {
  data: Buffer | null | undefined;
  metadata?: Buffer;
};

export type SetupPayload = {
  metadataMimeType: string;
  dataMimeType: string;
  keepAliveInterval: number;
  keepAliveMaxLifetime: number;
  flags: number;
  resumeToken: Buffer | null | undefined;
  data: Buffer | null | undefined;
  metadata?: Buffer;
};

export interface Cancellable {
  cancel(): void;
}

export interface Requestable {
  request(requestN: number): void;
}

export interface OnExtensionSubscriber {
  onExtension(
    extendedType: number,
    content: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void;
}

export interface OnNextSubscriber {
  onNext(payload: Payload, isComplete: boolean): void;
}

export interface OnTerminalSubscriber {
  onError(error: Error): void;
  onComplete(): void;
}

export type StreamConfig = {
  outbound: Outbound;
  fragmentSize: number;
};

export interface StreamLifecycleHandler {
  handleReady(streamId: number, config: StreamConfig): boolean;
  handleReject(error: Error): void;
}

export interface StreamFrameHandler extends FrameHandler {
  readonly streamId: number;
  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void;
  close(error?: Error): void;
}

export interface StreamsRegistry {
  get(streamId: number): StreamFrameHandler;
  add(handler: StreamFrameHandler, streamId: number): void;
  add(handler: StreamFrameHandler & StreamLifecycleHandler): void;
  remove(handler: StreamFrameHandler): void;
}

export interface SocketAcceptor {
  accept(payload: SetupPayload, remotePeer: RSocket): Promise<Partial<RSocket>>;
}

/**
 * A contract providing different interaction models per the [ReactiveSocket protocol]
 (https://github.com/ReactiveSocket/reactivesocket/blob/master/Protocol.md).
 */
export interface RSocket extends Closeable {
  /**
   * Fire and Forget interaction model of `ReactiveSocket`. The returned
   * Publisher resolves when the passed `payload` is successfully handled.
   */
  fireAndForget(
    payload: Payload,
    responderStream: OnTerminalSubscriber
  ): Cancellable;

  /**
   * Request-Response interaction model of `ReactiveSocket`. The returned
   * Publisher resolves with the response.
   */
  requestResponse(
    payload: Payload,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Cancellable & OnExtensionSubscriber;

  /**
   * Request-Stream interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(s).
   */
  requestStream(
    payload: Payload,
    initialRequestN: number,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Requestable & Cancellable & OnExtensionSubscriber;

  /**
   * Request-Channel interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(boolean)
   */
  requestChannel(
    payload: Payload,
    initialRequestN: number,
    isCompleted: boolean,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable
  ): OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable;

  /**
   * Metadata-Push interaction model of `ReactiveSocket`. The returned Publisher
   * resolves when the passed `payload` is successfully handled.
   */
  metadataPush(metadata: Buffer, responderStream: OnTerminalSubscriber): void;
}
