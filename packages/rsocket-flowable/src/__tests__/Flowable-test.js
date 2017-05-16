/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import Flowable from '../Flowable';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';

jest.useFakeTimers();

describe('Flowable', () => {
  let values;

  class InfiniteIntegersSource implements Subscription<number> {
    _subscriber: Subscriber<number>;

    constructor(subscriber: Subscriber<number>) {
      this._subscriber = subscriber;
      this._subscriber.onSubscribe(this);
    }

    cancel(): void {
      this._subscriber.onComplete();
    }

    request(n: number): void {
      for (let ii = 0; ii < n && ii < 1000; ii++) {
        this._subscriber.onNext(ii);
      }
    }
  }

  beforeEach(() => {
    values = [];
  });

  it('runs asynchronously', () => {
    const subscriber = genMockSubscriber({
      onNext: value => values.push(value),
      onSubscribe: subscription => subscription.request(1),
    });

    const publisher = new Flowable(
      subscriber => new InfiniteIntegersSource(subscriber),
    );
    publisher.subscribe(subscriber);

    expect(values).toEqual([0]);
  });

  it('requests multiple batches', () => {
    let phase = 0;
    let subscription;
    const subscriber = genMockSubscriber({
      onNext(value) {
        values.push(value);
        if (phase === 0) {
          phase++;
          // request one extra batch
          subscription.request(2);
        }
      },
      onSubscribe(_subscription) {
        subscription = _subscription;
        subscription.request(1);
      },
    });

    const publisher = new Flowable(
      subscriber => new InfiniteIntegersSource(subscriber),
    );
    publisher.subscribe(subscriber);

    expect(values).toEqual([0]);
    jest.runAllTimers();
    expect(values).toEqual([0, 0, 1]);
  });

  it('cancels before request count is reached', () => {
    let subscription;
    const subscriber = genMockSubscriber({
      onNext(value) {
        values.push(value);
        if (value === 6) {
          subscription.cancel();
        }
      },
      onSubscribe(_subscription) {
        subscription = _subscription;
        subscription.request(10);
      },
    });

    const publisher = new Flowable(
      subscriber => new InfiniteIntegersSource(subscriber),
    );
    publisher.subscribe(subscriber);

    jest.runAllTimers();
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('map() maps values', () => {
    const subscriber = genMockSubscriber({
      onNext(value) {
        values.push(value);
      },
      onSubscribe(subscription) {
        subscription.request(5);
      },
    });

    const publisher = new Flowable(
      subscriber => new InfiniteIntegersSource(subscriber),
    );
    publisher.map(x => x * x).subscribe(subscriber);

    jest.runAllTimers();
    expect(values).toEqual([0, 1, 4, 9, 16]);
  });

  it('take() takes a fixed number of values', () => {
    const subscriber = genMockSubscriber({
      onNext(value) {
        values.push(value);
      },
      onSubscribe(subscription) {
        subscription.request(5);
      },
    });

    const publisher = new Flowable(
      subscriber => new InfiniteIntegersSource(subscriber),
    );
    publisher.take(5).subscribe(subscriber);

    jest.runAllTimers();
    expect(values).toEqual([0, 1, 2, 3, 4]);
  });
});
