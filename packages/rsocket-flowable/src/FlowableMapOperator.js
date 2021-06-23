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
  }
}
