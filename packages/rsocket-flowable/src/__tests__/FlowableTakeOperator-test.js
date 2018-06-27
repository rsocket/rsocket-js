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
