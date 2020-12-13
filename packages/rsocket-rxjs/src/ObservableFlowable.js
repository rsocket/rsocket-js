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

// $FlowIgnore
import {Observable, Observer, Subscription} from 'rxjs';

export default function toFlowable<T>(
  observable: Observable<T>,
  max?: number,
): Flowable<T> {
  return new Flowable<T>(subscriber => {
    subscriber.onSubscribe(
      new ObservableToFlowableOperator(subscriber, observable),
    );
  }, max);
}

// $FlowIgnore
class ObservableToFlowableOperator<T> implements ISubscription, Observer<T> {
  // $FlowIgnore
  _observable: Observable<T>;
  _subscriber: ISubscriber<T>;
  _max: number;

  _elements: T[];

  _cancelled: boolean;
  _done: boolean;
  _error: Error;

  // $FlowIgnore
  _subscription: Subscription;

  _requested: number;

  constructor(
    subscriber: ISubscriber<T>,
    observable: Observable<T>,
    max: number = Number.MAX_SAFE_INTEGER,
  ) {
    this._subscriber = subscriber;
    this._observable = observable;
    this._max = max;

    this._elements = new Array<T>(256);
    this._requested = 0;
  }

  next(value: T) {
    if (this._done) {
      return;
    }

    const requested = this._requested;
    if (requested > 0) {
      this._subscriber.onNext(value);

      if (requested < this._max) {
        this._requested--;
      }

      return;
    }

    this._elements.push(value);
  }

  error(error: any) {
    if (this._done) {
      return;
    }

    this._done = true;
    this._error = error;

    if (this._elements.length > 0) {
      return;
    }

    this._subscriber.onError(error);
  }

  complete() {
    if (this._done) {
      return;
    }

    this._done = true;

    if (this._elements.length > 0) {
      return;
    }

    this._subscriber.onComplete();
  }

  cancel() {
    if (this._cancelled) {
      return;
    }

    this._cancelled = true;

    if (this._subscription) {
      this._subscription.unsubscribe();
    }
  }

  request(n: number) {
    let currentRequested = this._requested;

    if (currentRequested + n >= this._max) {
      this._requested = this._max;
    } else {
      this._requested = currentRequested + n;
    }

    if (currentRequested > 0) {
      return;
    }

    if (!this._subscription) {
      this._subscription = this._observable.subscribe(this);
      return;
    }

    const elements = this._elements;
    const subscriber = this._subscriber;
    if (elements.length === 0) {
      return;
    }

    currentRequested = n;

    for (;;) {
      let produced = 0;
      for (; produced < currentRequested && elements.length > 0; produced++) {
        const value = elements.shift();

        if (value === null || value === undefined) {
          this.cancel();
          this.error(new Error('Received null or undefined value'));
          return;
        } else {
          subscriber.onNext(value);
        }
      }

      if (elements.length === 0 && this._done) {
        const e = this._error;
        if (e) {
          subscriber.onError(e);
        } else {
          subscriber.onComplete();
        }

        return;
      }

      this._requested -= produced;
      currentRequested = this._requested;

      if (currentRequested === 0) {
        return;
      }
    }
  }
}
