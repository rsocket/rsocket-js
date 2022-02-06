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

import { Closeable } from "./Common";

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

export interface SocketAcceptor {
  accept(payload: SetupPayload, remotePeer: RSocket): Promise<Partial<RSocket>>;
}

export type FireAndForget = RSocket["fireAndForget"];

export type RequestResponse = RSocket["requestResponse"];

export type RequestStream = RSocket["requestStream"];

export type RequestChannel = RSocket["requestChannel"];

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
