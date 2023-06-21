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

export class Deferred implements Closeable {
  private _done: boolean = false;
  private _error: Error | undefined;
  private onCloseCallbacks: Array<(reason?: Error) => void> = [];

  get done(): boolean {
    return this._done;
  }

  /**
   * Signals to an observer that the Deferred operation has been closed, which invokes
   * the provided `onClose` callback.
   */
  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    this._done = true;
    this._error = error;

    if (error) {
      for (const callback of this.onCloseCallbacks) {
        callback(error);
      }
      return;
    }

    for (const callback of this.onCloseCallbacks) {
      callback();
    }
  }

  /**
   * Registers a callback to be called when the Closeable is closed. optionally with an Error.
   */
  onClose(callback: (reason?: Error) => void): void {
    if (this._done) {
      callback(this._error);
      return;
    }
    this.onCloseCallbacks.push(callback);
  }
}
