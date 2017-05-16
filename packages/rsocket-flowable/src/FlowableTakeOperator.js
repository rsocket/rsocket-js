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
 * An operator that requests a fixed number of values from its source
 * `Subscription` and forwards them to its `Subscriber`, cancelling the
 * subscription when the requested number of items has been reached.
 */
export default class FlowableTakeOperator<T> implements ISubscriber<T> {
  _subscriber: ISubscriber<T>;
  _subscription: ?ISubscription;
  _toTake: number;

  constructor(subscriber: ISubscriber<T>, toTake: number) {
    this._subscriber = subscriber;
    this._subscription = null;
    this._toTake = toTake;
  }

  onComplete(): void {
    this._subscriber.onComplete();
  }

  onError(error: Error): void {
    this._subscriber.onError(error);
  }

  onNext(t: T): void {
    try {
      this._subscriber.onNext(t);
      if (--this._toTake === 0) {
        this._cancelAndComplete();
      }
    } catch (e) {
      nullthrows(this._subscription).cancel();
      this._subscriber.onError(e);
    }
  }

  onSubscribe(subscription: ISubscription): void {
    this._subscription = subscription;
    this._subscriber.onSubscribe(subscription);
    if (this._toTake <= 0) {
      this._cancelAndComplete();
    }
  }

  _cancelAndComplete(): void {
    nullthrows(this._subscription).cancel();
    this._subscriber.onComplete();
  }
}
