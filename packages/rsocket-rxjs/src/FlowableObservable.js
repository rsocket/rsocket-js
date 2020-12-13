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

import {ISubscriber, ISubscription} from 'rsocket-types';
import {Flowable} from 'rsocket-flowable';

import {Subscriber, SubscriptionLike, SchedulerLike} from 'rxjs';
import {Observable} from 'rxjs';

export default function toObservable<T>(
  flowable: IPublisher<T>,
  prefetch: number = 256,
  // $FlowIgnore
  scheduler?: SchedulerLike,
): Observable<T> {
  return new Observable<T>(subscriber => {
    const flowableToObservableOperator = new FlowableToObservableOperator(
      subscriber,
      prefetch,
      scheduler,
    );
    flowable.subscribe(flowableToObservableOperator);
    return flowableToObservableOperator;
  });
}

// $FlowIgnore
class FlowableToObservableOperator<T>
  implements SubscriptionLike, ISubscriber<T> {
  // $FlowIgnore
  _subscriber: Subscriber;
  // $FlowIgnore
  _scheduler: SchedulerLike;
  _prefetch: number;
  _limit: number;

  _subscription: ISubscription;

  _produced: number;

  closed: boolean;

  // $FlowIgnore
  constructor(
    subscriber: Subscriber,
    prefetch: number = 256,
    scheduler: SchedulerLike,
  ) {
    this._subscriber = subscriber;
    this._scheduler = scheduler;
    this._prefetch = prefetch;
    this._limit =
      prefetch === Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : prefetch - (prefetch >> 2);
    this._produced = 0;
  }

  onSubscribe(subscription: ISubscription): void {
    if (this.closed) {
      subscription.cancel();
      return;
    }

    this._subscription = subscription;
    subscription.request(this._prefetch);
  }

  onNext(value: T): void {
    this._subscriber.next(value);

    if (++this._produced === this._limit) {
      if (this._scheduler) {
        this._scheduler.schedule(() => this._subscription.request(this._limit));
      } else {
        this._subscription.request(this._limit);
      }
    }
  }

  onComplete(): void {
    this._subscriber.complete();
  }

  onError(error: Error): void {
    this._subscriber.error(error);
  }

  unsubscribe(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (this._subscription) {
      this._subscription.cancel();
    }
  }
}
