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

export interface Closeable {
  /**
   * Close the underlying connection, emitting `onComplete` on the receive()
   * Publisher.
   */
  close(error?: Error): void;

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback: (error?: Error) => void): void;
}

export interface Availability {
  /**
   * Returns positive number representing the availability of RSocket requester. Higher is better, 0.0
   * means not available.
   */
  readonly availability: number;
}
