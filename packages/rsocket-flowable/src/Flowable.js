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

import type {
  IPublisher,
  ISubscriber,
  IPartialSubscriber,
  ISubscription,
} from 'rsocket-types';

import FlowableMapOperator from './FlowableMapOperator';
import FlowableTakeOperator from './FlowableTakeOperator';

import invariant from 'fbjs/lib/invariant';
import warning from 'fbjs/lib/warning';
import emptyFunction from 'fbjs/lib/emptyFunction';

export type Source<T> = (subscriber: ISubscriber<T>) => void;

/**
 * Implements the ReactiveStream `Publisher` interface with Rx-style operators.
 */
export default class Flowable<T> implements IPublisher<T> {
  _max: number;
  _source: Source<T>;

  static just<U>(...values: Array<U>): Flowable<U> {
    return new Flowable(subscriber => {
      let cancelled = false;
      let i = 0;
      subscriber.onSubscribe({
        cancel: () => {
          cancelled = true;
        },
        request: n => {
          while (!cancelled && n > 0 && i < values.length) {
            subscriber.onNext(values[i++]);
            n--;
          }
          if (!cancelled && i == values.length) {
            subscriber.onComplete();
          }
        },
      });
    });
  }

  static error<U = empty>(error: Error): Flowable<U> {
    return new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: () => {},
        request: () => {
          subscriber.onError(error);
        },
      });
    });
  }

  static never<U = empty>(): Flowable<U> {
    return new Flowable(subscriber => {
      subscriber.onSubscribe({
        cancel: emptyFunction,
        request: emptyFunction,
      });
    });
  }

  constructor(source: Source<T>, max?: number = Number.MAX_SAFE_INTEGER) {
    this._max = max;
    this._source = source;
  }

  subscribe(
    subscriberOrCallback?: ?(IPartialSubscriber<T> | ((T) => void)),
  ): void {
    let partialSubscriber: ?IPartialSubscriber<T>;
    if (typeof subscriberOrCallback === 'function') {
      partialSubscriber = this._wrapCallback(subscriberOrCallback);
    } else {
      partialSubscriber = subscriberOrCallback;
    }
    const subscriber = new FlowableSubscriber(partialSubscriber, this._max);
    this._source(subscriber);
  }

  lift<R>(
    onSubscribeLift: (subscriber: ISubscriber<R>) => ISubscriber<T>,
  ): Flowable<R> {
    return new Flowable(subscriber =>
      this._source(onSubscribeLift(subscriber)),
    );
  }

  map<R>(fn: (data: T) => R): Flowable<R> {
    return this.lift(subscriber => new FlowableMapOperator(subscriber, fn));
  }

  take(toTake: number): Flowable<T> {
    return this.lift(
      subscriber => new FlowableTakeOperator(subscriber, toTake),
    );
  }

  _wrapCallback(callback: (T) => void): IPartialSubscriber<T> {
    const max = this._max;
    return {
      onNext: callback,
      onSubscribe(subscription) {
        subscription.request(max);
      },
    };
  }
}

/**
 * @private
 */
class FlowableSubscriber<T> implements ISubscriber<T> {
  _active: boolean;
  _emitting: boolean;
  _max: number;
  _pending: number;
  _started: boolean;
  _subscriber: IPartialSubscriber<T>;
  _subscription: ?ISubscription;

  constructor(subscriber?: ?IPartialSubscriber<T>, max: number) {
    this._active = false;
    this._max = max;
    this._pending = 0;
    this._started = false;
    this._subscriber = subscriber || {};
    this._subscription = null;
  }

  onComplete(): void {
    if (!this._active) {
      warning(
        false,
        'Flowable: Invalid call to onComplete(): %s.',
        this._started
          ? 'onComplete/onError was already called'
          : 'onSubscribe has not been called',
      );
      return;
    }
    this._active = false;
    this._started = true;
    try {
      if (this._subscriber.onComplete) {
        this._subscriber.onComplete();
      }
    } catch (error) {
      if (this._subscriber.onError) {
        this._subscriber.onError(error);
      }
    }
  }

  onError(error: Error): void {
    if (this._started && !this._active) {
      warning(
        false,
        'Flowable: Invalid call to onError(): %s.',
        this._active
          ? 'onComplete/onError was already called'
          : 'onSubscribe has not been called',
      );
      return;
    }
    this._active = false;
    this._started = true;
    this._subscriber.onError && this._subscriber.onError(error);
  }

  onNext(data: T): void {
    if (!this._active) {
      warning(
        false,
        'Flowable: Invalid call to onNext(): %s.',
        this._active
          ? 'onComplete/onError was already called'
          : 'onSubscribe has not been called',
      );
      return;
    }
    if (this._pending === 0) {
      warning(
        false,
        'Flowable: Invalid call to onNext(), all request()ed values have been ' +
          'published.',
      );
      return;
    }
    if (this._pending !== this._max) {
      this._pending--;
    }
    try {
      this._subscriber.onNext && this._subscriber.onNext(data);
    } catch (error) {
      if (this._subscription) {
        this._subscription.cancel();
      }
      this.onError(error);
    }
  }

  onSubscribe(subscription?: ?ISubscription): void {
    if (this._started) {
      warning(
        false,
        'Flowable: Invalid call to onSubscribe(): already called.',
      );
      return;
    }
    this._active = true;
    this._started = true;
    this._subscription = subscription;
    try {
      this._subscriber.onSubscribe &&
        this._subscriber.onSubscribe({
          cancel: this._cancel,
          request: this._request,
        });
    } catch (error) {
      this.onError(error);
    }
  }

  _cancel = () => {
    if (!this._active) {
      return;
    }
    this._active = false;
    if (this._subscription) {
      this._subscription.cancel();
    }
  };

  _request = (n: number) => {
    invariant(
      Number.isInteger(n) && n >= 1 && n <= this._max,
      'Flowable: Expected request value to be an integer with a ' +
        'value greater than 0 and less than or equal to %s, got ' +
        '`%s`.',
      this._max,
      n,
    );
    if (!this._active) {
      return;
    }
    if (n === this._max) {
      this._pending = this._max;
    } else {
      this._pending += n;
      if (this._pending >= this._max) {
        this._pending = this._max;
      }
    }
    if (this._subscription) {
      this._subscription.request(n);
    }
  };
}
