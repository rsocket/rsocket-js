/*
 * TODO: should we also declare an `onCancel` event method? Invoking `cancel` should canel the `Cancellable`,
 *  but observers of the `Cancellable` may want to be notified when such a cancellation occurs.
 */
export type TEncodable = string | Buffer | Uint8Array;

export interface ICancellable {
  cancel(): void;
}

export interface ISubscription extends ICancellable {
  request(requestN: number): void;
}

export interface IExtendable {
  onExtension(
    extendedType: number,
    payload: TPayload,
    canBeIgnored: boolean
  ): void;
}

export interface IUnidirectionalStream extends ISubscription, IExtendable {
  onError(error: Error): void;
  onNext(payload: TPayload, isCompletion: boolean): void;
  onComplete(): void;
}

/**
 * A contract providing different interaction models per the [ReactiveSocket protocol]
 (https://github.com/ReactiveSocket/reactivesocket/blob/master/Protocol.md).
 */
export interface IRSocket {
  /**
   * Fire and Forget interaction model of `ReactiveSocket`. The returned
   * Publisher resolves when the passed `payload` is successfully handled.
   */
  fireAndForget(
    payload: TPayload,
    responderStream: IUnidirectionalStream
  ): ICancellable;

  /**
   * Request-Response interaction model of `ReactiveSocket`. The returned
   * Publisher resolves with the response.
   */
  requestResponse(
    payload: TPayload,
    responderStream: IUnidirectionalStream
  ): ICancellable;

  /**
   * Request-Stream interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(s).
   */
  requestStream(
    payload: TPayload,
    responderStream: IUnidirectionalStream
  ): ISubscription;

  /**
   * Request-Channel interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(boolean)
   */
  requestChannel(
    payload: TPayload,
    initialRequestN: number,
    isCompleted: boolean,
    responderStream: IUnidirectionalStream
  ): IUnidirectionalStream;

  /**
   * Metadata-Push interaction model of `ReactiveSocket`. The returned Publisher
   * resolves when the passed `payload` is successfully handled.
   */
  metadataPush(payload: TPayload): void;

  /**
   * Close this `ReactiveSocket` and the underlying transport connection.
   */
  close?(): void;

  /**
   * TODO: should this be a callback rather than a Promise? Usage of Promise in this way feels non-standard with common
   *  usages of promises in JS projects.
   */
  onClose?(): Promise<void>;

  /**
   * Returns positive number representing the availability of RSocket requester. Higher is better, 0.0
   * means not available.
   */
  availability?(): number;
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface IDuplexConnection {
  /**
   * Send a single frame on the connection.
   */
  sendFrame(s: TFrame): void;

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
  handleFrames(handler: (arg0: TFrame) => void): void;

  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(error?: Error): Promise<void>;

  /**
   */
  onClose(handler: (arg0: IDuplexConnection) => void): Promise<void>;
}

/**
 * A single unit of data exchanged between the peers of a `ReactiveSocket`.
 */
export type TPayload = {
  data: TEncodable;
  metadata?: TEncodable;
};

export type TFrame =
  | TCancelFrame
  | TErrorFrame
  | TKeepAliveFrame
  | TLeaseFrame
  | TPayloadFrame
  | TMetadataPushFrame
  | TRequestChannelFrame
  | TRequestFnfFrame
  | TRequestNFrame
  | TRequestResponseFrame
  | TRequestStreamFrame
  | TResumeFrame
  | TResumeOkFrame
  | TSetupFrame
  | TUnsupportedFrame;

export type TTFrameWithData = {
  data: Buffer | null;
  metadata: Buffer | null;
};

export type TCancelFrame = {
  type: 0x09;
  flags: number;
  streamId: number;
  length?: number;
};

export type TErrorFrame = {
  type: 0x0b;
  flags: number;
  code: number;
  message: string;
  streamId: number;
  length?: number;
};

export type TKeepAliveFrame = {
  type: 0x03;
  flags: number;
  data: Buffer | null;
  lastReceivedPosition: number;
  streamId: 0;
  length?: number;
};

export type TLeaseFrame = {
  type: 0x02;
  flags: number;
  ttl: number;
  requestCount: number;
  metadata: Buffer | null;
  streamId: 0;
  length?: number;
};

export type TPayloadFrame = {
  type: 0x0a;
  flags: number;
  data: Buffer | null;
  metadata: Buffer | null;
  streamId: number;
  length?: number;
};

export type TMetadataPushFrame = {
  type: 0x0c;
  metadata: Buffer | null;
  flags: number;
  streamId: 0;
  length?: number;
};

export type TRequestChannelFrame = {
  type: 0x07;
  data: Buffer | null;
  metadata?: Buffer;
  flags: number;
  requestN: number;
  streamId: number;
  length?: number;
};

export type TRequestFnfFrame = {
  type: 0x05;
  data: Buffer | null;
  metadata: Buffer | null;
  flags: number;
  streamId: number;
  length?: number;
};

export type TRequestNFrame = {
  type: 0x08;
  flags: number;
  requestN: number;
  streamId: number;
  length?: number;
};

export type TRequestResponseFrame = {
  type: 0x04;
  data: Buffer | null;
  metadata: Buffer | null;
  flags: number;
  streamId: number;
  length?: number;
};

export type TRequestStreamFrame = {
  type: 0x06;
  data: Buffer | null;
  metadata: Buffer | null;
  flags: number;
  requestN: number;
  streamId: number;
  length?: number;
};

export type TResumeFrame = {
  type: 0x0d;
  clientPosition: number;
  flags: number;
  majorVersion: number;
  minorVersion: number;
  resumeToken: Buffer;
  serverPosition: number;
  streamId: 0;
  length?: number;
};

export type TResumeOkFrame = {
  type: 0x0e;
  clientPosition: number;
  flags: number;
  streamId: 0;
  length?: number;
};

export type TSetupFrame = {
  type: 0x01;
  dataMimeType: string;
  data: TEncodable;
  flags: number;
  keepAlive: number;
  lifetime: number;
  metadata: TEncodable;
  metadataMimeType: string;
  resumeToken: TEncodable;
  streamId: 0;
  majorVersion: number;
  minorVersion: number;
  length?: number;
};

export type TUnsupportedFrame = {
  type: 0x3f | 0x00;
  streamId: 0;
  flags: number;
  length?: number;
};
