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

import type {Subscriber} from '../../ReactiveStreamTypes';

type PartialSubscriber<T> = {|
  onComplete?: () => void,
  onError?: (error: Error) => void,
  onNext?: (t: T) => void,
  onSubscribe?: (subscription: Subscription) => void,
|};

export function genMockSubscriber<T>(
  partialSubscriber?: PartialSubscriber<T>,
): Subscriber<T> {
  let subscription;
  partialSubscriber = partialSubscriber || {};
  const subscriber = {
    onComplete: jest.fn(partialSubscriber.onComplete || (() => {})),
    onError: jest.fn(partialSubscriber.onError || (() => {})),
    onNext: jest.fn(partialSubscriber.onNext || (() => {})),
    onSubscribe: jest.fn(sub => {
      partialSubscriber.onSubscribe && partialSubscriber.onSubscribe(sub);
      subscription = sub;
    }),
  };
  subscriber.mock = {
    cancel: () => subscription.cancel(),
    request: n => subscription.request(n),
  };
  subscriber.mockClear = () => {
    subscriber.onComplete.mockClear();
    subscriber.onError.mockClear();
    subscriber.onNext.mockClear();
    subscriber.onSubscribe.mockClear();
  };
  return subscriber;
}
