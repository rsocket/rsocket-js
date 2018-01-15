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

import Deferred from 'fbjs/lib/Deferred';

import nullthrows from 'fbjs/lib/nullthrows';

import type {Payload} from 'rsocket-core';
import type {Subscriber, Subscription} from 'reactor-core-js/reactivestreams-spec';

export default class RSocketTckSubscriber
  implements Subscriber<Payload<*, *>> {
  _cancelled: boolean;
  _completeDefer: Deferred<void, Error>;
  _completed: boolean;
  _errorDefer: Deferred<void, Error>;
  _errored: boolean;
  _log: Function;
  _payloadCount: ?number;
  _payloadDefer: ?Deferred<void, Error>;
  _payloads: Array<Payload<*, *>>;
  _subscription: ?Subscription;

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
    nullthrows(this._subscription).cancel();
  }

  request(n: number): void {
    nullthrows(this._subscription).request(n);
  }

  onComplete(): void {
    this._log('onComplete');
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

  onNext(payload: Payload<*, *>): void {
    this._log('onNext: %s', JSON.stringify(payload));
    this._payloads.push(payload);
    if (this._payloadCount != null && this._payloadDefer != null) {
      this._payloadCount--;
      if (this._payloadCount === 0) {
        this._payloadDefer.resolve();
      }
    }
  }

  onSubscribe(subscription: Subscription): void {
    this._log('onSubscribe');
    this._subscription = subscription;
  }
}
