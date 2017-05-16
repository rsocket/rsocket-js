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

'use strict';

import type {
  IPublisher,
  ISubscriber,
  IPartialSubscriber,
  ISubscription,
} from '../../ReactiveStreamTypes';

import FlowableMapOperator from './FlowableMapOperator';
import FlowableTakeOperator from './FlowableTakeOperator';

import invariant from 'fbjs/lib/invariant';
import warning from 'fbjs/lib/warning';

export type Source<T> = (subscriber: ISubscriber<T>) => void;

/**
 * Implements the ReactiveStream `Publisher` interface with Rx-style operators.
 */
export default class Flowable<T> implements IPublisher<T> {
  _max: number;
  _source: Source<T>;

  constructor(source: Source<T>, max?: number = Number.MAX_SAFE_INTEGER) {
    this._max = max;
    this._source = source;
  }

  subscribe(partialSubscriber?: ?IPartialSubscriber<T>): void {
    const subscriber = new FlowableSubscriber(partialSubscriber, this._max);
    this._source(subscriber);
  }

  lift<R>(
    onSubscribeLift: (subscriber: ISubscriber<R>) => ISubscriber<T>,
  ): Flowable<R> {
    return new Flowable(subscriber =>
      this._source(onSubscribeLift(subscriber)));
  }

  map<R>(fn: (data: T) => R): Flowable<R> {
    return this.lift(subscriber => new FlowableMapOperator(subscriber, fn));
  }

  take(toTake: number): Flowable<T> {
    return this.lift(
      subscriber => new FlowableTakeOperator(subscriber, toTake),
    );
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
    this._emitting = false;
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
    this._emitting = true;
    if (this._pending !== this._max) {
      this._pending--;
    }
    try {
      this._subscriber.onNext && this._subscriber.onNext(data);
    } catch (error) {
      this.onError(error);
    }
    this._emitting = false;
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
    if (this._subscription && this._subscription.cancel) {
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
    if (this._emitting) {
      // Prevent onNext -> request -> onNext -> request -> ... cycles in a
      // single event loop by deferring any requests within an onNext invocation
      // to the end of the current event loop. Uses `request` instead of
      // `callbacks.request` to update `_pending` at the appropriate time and account
      // for the possibility of an intervening cancellation.
      setTimeout(() => this._request(n), 0);
    } else {
      if (n === this._max) {
        this._pending = this._max;
      } else {
        this._pending += n;
        if (this._pending >= this._max) {
          this._pending = this._max;
        }
      }
      if (this._subscription && this._subscription.request) {
        this._subscription.request(n);
      }
    }
  };
}
