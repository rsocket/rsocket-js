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

import type {ISubscriber, ISubscription} from 'rsocket-types';

/**
 * An operator that `request()`s the given number of items immediately upon
 * being subscribed.
 */
export default class FlowableRequestOperator<T> implements ISubscriber<T> {
  _subscriber: ISubscriber<T>;
  _toRequest: number;

  constructor(subscriber: ISubscriber<T>, toRequest: number) {
    this._subscriber = subscriber;
    this._toRequest = toRequest;
  }

  onComplete(): void {
    this._subscriber.onComplete();
  }

  onError(error: Error): void {
    this._subscriber.onError(error);
  }

  onNext(t: T): void {
    this._subscriber.onNext(t);
  }

  onSubscribe(subscription: ISubscription): void {
    this._subscriber.onSubscribe(subscription);
    subscription.request(this._toRequest);
  }
}
