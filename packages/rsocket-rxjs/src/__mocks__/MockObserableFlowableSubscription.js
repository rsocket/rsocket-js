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

import Flowable from '../Flowable';

/**
 * Creates an object implementing the `Subscription` interface with mock
 * properties for inspecting the cancellation status and number of values
 * requested.
 *
 * Mock Properties:
 * - `isCancelled: boolean`: True if `cancel()` has been called
 * - `lastRequested: ?number`: Last value passed to `request(n)`, null if not
 *   yet called.
 * - `totalRequested: number`: Sum of values passed to `request(n)`, zero if not
 *   yet called.
 *
 * Example:
 * Test a subscriber that requests 1 value and cancels once it's received
 *
 * ```
 * const subscription = genMockSubscription();
 * subscriber.onSubscribe(subscription);
 * expect(subscription.mock.lastRequested).toBe(1);
 * subscriber.onNext(...);
 * expect(subscription.mock.isCancelled).toBe(true);
 * ```
 */
export function genMockSubscription(subscriber) {
  const subscription = {
    cancel: jest.fn(() => {
      subscription.mock.isCancelled = true;
    }),
    mock: {
      isCancelled: false,
      lastRequested: null,
      totalRequested: 0,
    },
    request: jest.fn(n => {
      subscription.mock.lastRequested = n;
      subscription.mock.totalRequested += n;
    }),
  };
  const mockClear = subscription.mockClear;
  subscription.mockClear = () => {
    mockClear.apply(subscription);
    subscription.mock.isCancelled = false;
    subscription.mock.lastRequested = null;
    subscription.mock.totalRequested = 0;
  };
  return subscription;
}

export function genMockPublisher() {
  let subscriber;
  const cancel = jest.fn();
  const request = jest.fn();
  const publisher = new Flowable(_subscriber => {
    subscriber = _subscriber;
    subscriber.onSubscribe({cancel, request});
  });
  publisher.cancel = cancel;
  publisher.request = request;
  publisher.onComplete = () => subscriber && subscriber.onComplete();
  publisher.onError = error => subscriber && subscriber.onError(error);
  publisher.onNext = data => subscriber && subscriber.onNext(data);
  return publisher;
}
