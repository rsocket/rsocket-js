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

import nullthrows from 'fbjs/lib/nullthrows';

import type {ISubscriber, ISubscription} from '../../ReactiveStreamTypes';

/**
 * An operator that acts like Array.map, applying a given function to
 * all values provided by its `Subscription` and passing the result to its
 * `Subscriber`.
 */
export default class FlowableMapOperator<T, R> implements ISubscriber<T> {
  _fn: (t: T) => R;
  _subscriber: ISubscriber<R>;
  _subscription: ?ISubscription;

  constructor(subscriber: ISubscriber<R>, fn: (t: T) => R) {
    this._fn = fn;
    this._subscriber = subscriber;
    this._subscription = null;
  }

  onComplete(): void {
    this._subscriber.onComplete();
  }

  onError(error: Error): void {
    this._subscriber.onError(error);
  }

  onNext(t: T): void {
    try {
      this._subscriber.onNext(this._fn(t));
    } catch (e) {
      nullthrows(this._subscription).cancel();
      this._subscriber.onError(e);
    }
  }

  onSubscribe(subscription: ISubscription): void {
    this._subscription = subscription;
    this._subscriber.onSubscribe(subscription);
  }
}
