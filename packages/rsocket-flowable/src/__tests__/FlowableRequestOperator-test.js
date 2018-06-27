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

import FlowableRequestOperator from '../FlowableRequestOperator';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';

jest.useFakeTimers();

describe('FlowableRequestOperator', () => {
  let subscriber;
  let subscription;

  beforeEach(() => {
    subscriber = genMockSubscriber();
    subscription = {
      cancel: jest.fn(),
      request: jest.fn(),
    };
  });

  it('calls onSubscribe() and requests unbounded number of values', () => {
    const toRequest = 42;
    const all = new FlowableRequestOperator(subscriber, toRequest);
    all.onSubscribe(subscription);
    expect(subscriber.onSubscribe.mock.calls.length).toBe(1);
    expect(subscriber.onSubscribe.mock.calls[0][0]).toBe(subscription);
    expect(subscription.request.mock.calls.length).toBe(1);
    expect(subscription.request.mock.calls[0][0]).toBe(toRequest);
  });

  it('calls onComplete()', () => {
    const all = new FlowableRequestOperator(subscriber, 42);
    all.onComplete();
    expect(subscriber.onComplete.mock.calls.length).toBe(1);
  });

  it('calls onError()', () => {
    const all = new FlowableRequestOperator(subscriber, 42);
    const error = new Error('wtf');
    all.onError(error);
    expect(subscriber.onError.mock.calls.length).toBe(1);
    expect(subscriber.onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onNext()', () => {
    const all = new FlowableRequestOperator(subscriber, 42);
    all.onSubscribe(subscription);
    all.onNext(0);
    expect(subscriber.onNext.mock.calls.length).toBe(1);
    expect(subscriber.onNext.mock.calls[0][0]).toBe(0);
  });
});
