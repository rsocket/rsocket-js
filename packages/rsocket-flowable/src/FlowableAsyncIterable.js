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

'use strict';

import type {ISubscriber, ISubscription} from 'rsocket-types';
import Flowable from './Flowable';

// $FlowFixMe
export default class FlowableAsyncIterable<T> implements AsyncIterable<T> {
  _source: Flowable<T>;
  _prefetch: number;

  constructor(source: Flowable<T>, prefetch: number = 256) {
    this._source = source;
    this._prefetch = prefetch;
  }

  asyncIterator(): AsyncIterator<T> {
    const asyncIteratorSubscriber = new AsyncIteratorSubscriber(this._prefetch);
    this._source.subscribe(asyncIteratorSubscriber);
    return asyncIteratorSubscriber;
  }

  // $FlowFixMe
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.asyncIterator();
  }
}

// $FlowFixMe
class AsyncIteratorSubscriber<T> implements ISubscriber<T>, AsyncIterator<T> {
  _values: T[];
  _prefetch: number;
  _limit: number;

  _subscription: ISubscription;

  _produced: number;

  _done: boolean;
  _error: Error;

  _resolve: ?(
    result: Promise<IteratorResult<T, void>> | IteratorResult<T, void>,
  ) => void;
  _reject: ?(reason?: any) => void;

  constructor(prefetch: number = 256) {
    this._prefetch = prefetch;
    this._values = [];
    this._limit =
      prefetch === Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : prefetch - (prefetch >> 2);
    this._produced = 0;
  }

  onSubscribe(subscription: ISubscription): void {
    this._subscription = subscription;
    subscription.request(this._prefetch);
  }

  onNext(value: T): void {
    const resolve = this._resolve;
    if (resolve) {
      this._resolve = undefined;
      this._reject = undefined;

      if (++this._produced === this._limit) {
        this._produced = 0;
        this._subscription.request(this._limit);
      }

      resolve({done: false, value});
      return;
    }

    this._values.push(value);
  }

  onComplete(): void {
    this._done = true;

    const resolve = this._resolve;
    if (resolve) {
      this._resolve = undefined;
      this._reject = undefined;

      resolve({done: true});
    }
  }

  onError(error: Error): void {
    this._done = true;
    this._error = error;

    const reject = this._reject;
    if (reject) {
      this._resolve = undefined;
      this._reject = undefined;

      reject(error);
    }
  }

  next(): Promise<IteratorResult<T, void>> {
    const value = this._values.shift();
    if (value) {
      if (++this._produced === this._limit) {
        this._produced = 0;
        this._subscription.request(this._limit);
      }

      return Promise.resolve({done: false, value});
    } else if (this._done) {
      if (this._error) {
        return Promise.reject(this._error);
      } else {
        return Promise.resolve({done: true});
      }
    } else {
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
    }
  }

  return(): Promise<IteratorResult<T, void>> {
    this._subscription.cancel();
    return Promise.resolve({done: true});
  }

  // $FlowFixMe
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}
