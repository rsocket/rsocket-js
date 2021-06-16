/** Copyright (c) Facebook, Inc. and its affiliates.
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
 *
 * @flow
 */

import type {Payload} from 'rsocket-types';
import {Deferred} from './Deferred';

export default class RSocketTckRequestResponseSubscriber {
  _cancelled: boolean;
  _completeDefer: Deferred<void, Error>;
  _completed: boolean;
  _errorDefer: Deferred<void, Error>;
  _errored: boolean;
  _log: Function;
  _payloadCount: ?number;
  _payloadDefer: ?Deferred<void, Error>;
  _payloads: Array<Payload<*, *>>;
  _subscription: ?any;

  constructor(log: Function) {
    this._cancelled = false;
    this._completeDefer = new Deferred();
    this._completed = false;
    this._errorDefer = new Deferred();
    this._errored = false;
    this._log = log;
    this._payloadCount = null;
    this._payloadDefer = null;
    this._payloads = [];
    this._subscription = null;
  }

  awaitN(n: number): Promise<void> {
    this._payloadCount = n;
    this._payloadDefer = new Deferred();
    return this._payloadDefer.getPromise();
  }

  awaitTerminal(): Promise<void> {
    return Promise.race([
      this._completeDefer.getPromise(),
      this._errorDefer.getPromise(),
    ]);
  }

  getPayloads(): Array<Payload<*, *>> {
    return this._payloads;
  }

  isCanceled(): boolean {
    return this._cancelled;
  }

  isCompleted(): boolean {
    return this._completed;
  }

  hasError(): boolean {
    return this._errored;
  }

  isSubscribed(): boolean {
    return this._subscription != null;
  }

  cancel(): void {
    this._cancelled = true;
    if (!this._subscription) {
      throw new Error('subscription is null or undefined');
    }
    this._subscription.cancel();
  }

  request(n: number): void {
    // no-op for requestResponse()
  }

  onComplete(payload: Payload<*, *>): void {
    this._log('onComplete');
    this._payloads.push(payload);
    if (this._payloadCount != null && this._payloadDefer != null) {
      this._payloadCount--;
      if (this._payloadCount === 0) {
        this._payloadDefer.resolve();
      }
    }
    this._completed = true;
    this._completeDefer.resolve();
    this._errorDefer.reject(new Error('onComplete was called unexpectedly.'));
  }

  onError(error: Error): void {
    this._log('onError: %s', error.message);
    this._errored = true;
    this._errorDefer.resolve();
    this._completeDefer.reject(new Error('onError was called unexpectedly.'));
  }

  onSubscribe(subscription: any): void {
    this._log('onSubscribe');
    this._subscription = subscription;
  }
}
