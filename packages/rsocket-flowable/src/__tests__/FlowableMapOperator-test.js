/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import FlowableMapOperator from '../FlowableMapOperator';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';
import {genMockSubscription} from '../__mocks__/MockFlowableSubscription';

jest.useFakeTimers();

describe('FlowableMapOperator', () => {
  let subscriber;

  beforeEach(() => {
    subscriber = genMockSubscriber();
  });

  it('calls onSubscribe()', () => {
    const subscription = {};
    const map = new FlowableMapOperator(subscriber);
    map.onSubscribe(subscription);
    expect(subscriber.onSubscribe.mock.calls.length).toBe(1);
    expect(subscriber.onSubscribe.mock.calls[0][0]).toBe(subscription);
  });

  it('calls onComplete()', () => {
    const map = new FlowableMapOperator(subscriber);
    map.onComplete();
    expect(subscriber.onComplete.mock.calls.length).toBe(1);
  });

  it('calls onError()', () => {
    const map = new FlowableMapOperator(subscriber);
    const error = new Error('wtf');
    map.onError(error);
    expect(subscriber.onError.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onNext() with the mapped value', () => {
    const fn = jest.fn(x => x * x);
    const map = new FlowableMapOperator(subscriber, fn);
    [0, 1, 2, 3].forEach(i => {
      map.onNext(i);
      expect(fn.mock.calls[0][0]).toBe(i);
      expect(subscriber.onNext.mock.calls[0][0]).toBe(fn(i));
      fn.mockClear();
      subscriber.mockClear();
    });
  });

  it('calls onError() and cancels the subscription on an error', () => {
    const error = new Error('wtf');
    const fn = jest.fn(() => {
      throw error;
    });
    const map = new FlowableMapOperator(subscriber, fn);

    const subscription = genMockSubscription(map);
    map.onSubscribe(subscription);

    map.onNext(null);
    expect(subscriber.onNext).not.toBeCalled();
    expect(subscriber.onError.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls[0][0]).toBe(error);
    expect(subscription.cancel.mock.calls.length).toBe(1);
  });
});
