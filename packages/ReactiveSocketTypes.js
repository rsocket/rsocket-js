/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import type {Flowable, Single} from 'rsocket-flowable';

/**
 * A contract providing different interaction models per the [ReactiveSocket protocol]
 (https://github.com/ReactiveSocket/reactivesocket/blob/master/Protocol.md).
 */
export interface ReactiveSocket<D, M> {
  /**
   * Fire and Forget interaction model of `ReactiveSocket`. The returned
   * Publisher resolves when the passed `payload` is successfully handled.
   */
  fireAndForget(payload: Payload<D, M>): void,

  /**
   * Request-Response interaction model of `ReactiveSocket`. The returned
   * Publisher resolves with the response.
   */
  requestResponse(payload: Payload<D, M>): Single<Payload<D, M>>,

  /**
   * Request-Stream interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(s).
   */
  requestStream(payload: Payload<D, M>): Flowable<Payload<D, M>>,

  /**
   * Request-Channel interaction model of `ReactiveSocket`. The returned
   * Publisher returns values representing the response(s).
   */
  requestChannel(payloads: Flowable<Payload<D, M>>): Flowable<Payload<D, M>>,

  /**
   * Metadata-Push interaction model of `ReactiveSocket`. The returned Publisher
   * resolves when the passed `payload` is successfully handled.
   */
  metadataPush(payload: Payload<D, M>): Single<void>,

  /**
   * Close this `ReactiveSocket` and the underlying transport connection.
   */
  close(): void,

  /**
   * Returns a Promise that completes as follows:
   * - Resolves when the socket is explicitly closed with close().
   * - Rejects on connection-level protocol errors (ERROR frame w stream id 0).
   * - Rejects if the underlying transport (DuplexConnection) closes or throws an error.
   */
  onClose(): Promise<void>,
}

/**
 * Represents a network connection with input/output used by a ReactiveSocket to
 * send/receive data.
 */
export interface DuplexConnection {
  /**
   * Send a single frame on the connection.
   */
  sendOne(frame: Frame): void,

  /**
   * Send all the `input` frames on this connection.
   *
   * Notes:
   * - Implementations must not cancel the subscription.
   * - Implementations must signal any errors by calling `onError` on the
   *   `receive()` Publisher.
   */
  send(input: Flowable<Frame>): void,

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
  receive(): Flowable<Frame>,

  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(): void,

  /**
   * Returns a Promise that resolves when the connection is closed. Implementations
   * must resolve the promise as follows:
   * - Resolve when the connection is closed explicitly with close().
   * - Resolve when the underlying connection is closed by the peer.
   * - Resolve when the underlying connection is closed due to an error.
   *
   * The promise should never be rejected, only resolved.
   */
  onClose(): Promise<void>,
}

/**
 * A type that can be written to a buffer.
 */
export type Encodable = string | Buffer | Uint8Array;

/**
 * A single unit of data exchanged between the peers of a `ReactiveSocket`.
 */
export type Payload<D, M> = {|
  data: ?D,
  metadata: ?M,
|};

export type Frame =
  | CancelFrame
  | ErrorFrame
  | KeepAliveFrame
  | LeaseFrame
  | PayloadFrame
  | RequestChannelFrame
  | RequestFnfFrame
  | RequestNFrame
  | RequestResponseFrame
  | RequestStreamFrame
  | SetupFrame;

// prettier-ignore
export type CancelFrame = {|
  type: 0x09,
  flags: number,
  streamId: number,
|};
// prettier-ignore
export type ErrorFrame = {|
  type: 0x0B,
  flags: number,
  code: number,
  message: string,
  streamId: number,
|};
// prettier-ignore
export type KeepAliveFrame = {|
  type: 0x03,
  flags: number,
  data: ?Encodable,
  lastReceivedPosition: number,
  streamId: 0,
|};
// prettier-ignore
export type LeaseFrame = {|
  type: 0x02,
  flags: number,
  ttl: number,
  requestCount: number,
  metadata: ?Encodable,
  streamId: 0,
|};
// prettier-ignore
export type PayloadFrame = {|
  type: 0x0A,
  flags: number,
  data: ?Encodable,
  metadata: ?Encodable,
  streamId: number,
|};
// prettier-ignore
export type RequestChannelFrame = {|
  type: 0x07,
  data: ?Encodable,
  metadata: ?Encodable,
  flags: number,
  requestN: number,
  streamId: number,
|};
// prettier-ignore
export type RequestFnfFrame = {|
  type: 0x05,
  data: ?Encodable,
  metadata: ?Encodable,
  flags: number,
  streamId: number,
|};
// prettier-ignore
export type RequestNFrame = {|
  type: 0x08,
  flags: number,
  requestN: number,
  streamId: number,
|};
// prettier-ignore
export type RequestResponseFrame = {|
  type: 0x04,
  data: ?Encodable,
  metadata: ?Encodable,
  flags: number,
  streamId: number,
|};
// prettier-ignore
export type RequestStreamFrame = {|
  type: 0x06,
  data: ?Encodable,
  metadata: ?Encodable,
  flags: number,
  requestN: number,
  streamId: number,
|};
// prettier-ignore
export type SetupFrame = {|
  type: 0x01,
  data: ?Encodable,
  dataMimeType: string,
  flags: number,
  keepAlive: number,
  lifetime: number,
  metadata: ?Encodable,
  metadataMimeType: string,
  resumeToken: ?Encodable,
  streamId: 0,
  majorVersion: number,
  minorVersion: number,
|};
