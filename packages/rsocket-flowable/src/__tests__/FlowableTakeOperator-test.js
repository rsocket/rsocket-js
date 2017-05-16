/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import FlowableTakeOperator from '../FlowableTakeOperator';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';
import {genMockSubscription} from '../__mocks__/MockFlowableSubscription';

jest.useFakeTimers();

describe('FlowableTakeOperator', () => {
  let subscriber;

  beforeEach(() => {
    subscriber = genMockSubscriber();
  });

  it('calls onSubscribe()', () => {
    const subscription = {};
    const take = new FlowableTakeOperator(subscriber);
    take.onSubscribe(subscription);
    expect(subscriber.onSubscribe.mock.calls.length).toBe(1);
    expect(subscriber.onSubscribe.mock.calls[0][0]).toBe(subscription);
  });

  it('calls onComplete()', () => {
    const take = new FlowableTakeOperator(subscriber);
    take.onComplete();
    expect(subscriber.onComplete.mock.calls.length).toBe(1);
  });

  it('calls onError()', () => {
    const take = new FlowableTakeOperator(subscriber);
    const error = new Error('wtf');
    take.onError(error);
    expect(subscriber.onError.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onNext() with the requested number of values', () => {
    const toTake = 3;
    const take = new FlowableTakeOperator(subscriber, toTake);

    const subscription = genMockSubscription(take);
    take.onSubscribe(subscription);
    for (let ii = 0; ii < toTake; ii++) {
      take.onNext(ii);
      expect(subscriber.onNext.mock.calls.length).toBe(1);
      expect(subscriber.onNext.mock.calls[0][0]).toBe(ii);
      if (ii === toTake) {
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
        expect(subscription.cancel.mock.calls.length).toBe(1);
      }
      subscriber.mockClear();
    }
  });

  it('calls onError() and cancels the subscription on an error', () => {
    const error = new Error('wtf');
    subscriber = genMockSubscriber({
      onNext() {
        throw error;
      },
    });
    const take = new FlowableTakeOperator(subscriber, 5);

    const subscription = genMockSubscription(take);
    take.onSubscribe(subscription);

    take.onNext(null);
    expect(subscriber.onNext.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls[0][0]).toBe(error);
    expect(subscription.cancel.mock.calls.length).toBe(1);
  });
});
