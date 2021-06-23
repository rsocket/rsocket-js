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
      if (!this._subscription) {
        throw new Error('subscription is null');
      }
      this._subscription.cancel();
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
    if (!this._subscription) {
      throw new Error('subscription is null');
    }
    this._subscription.cancel();
    this._subscriber.onComplete();
  }
}
