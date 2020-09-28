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

import Flowable from './Flowable';

/**
 * Returns a Publisher that provides the current time (Date.now()) every `ms`
 * milliseconds.
 *
 * The timer is established on the first call to `request`: on each
 * interval a value is published if there are outstanding requests,
 * otherwise nothing occurs for that interval. This approach ensures
 * that the interval between `onNext` calls is as regular as possible
 * and means that overlapping `request` calls (ie calling again before
 * the previous values have been vended) behaves consistently.
 */
export function every(ms: number): Flowable<number> {
  return new Flowable(subscriber => {
    let intervalId = null;
    let pending = 0;
    subscriber.onSubscribe({
      cancel: () => {
        if (intervalId != null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      },
      request: n => {
        if (n < Number.MAX_SAFE_INTEGER) {
          pending += n;
        } else {
          pending = Number.MAX_SAFE_INTEGER;
        }
        if (intervalId != null) {
          return;
        }
        intervalId = setInterval(() => {
          if (pending > 0) {
            if (pending !== Number.MAX_SAFE_INTEGER) {
              pending--;
            }
            subscriber.onNext(Date.now());
          }
        }, ms);
      },
    });
  });
}
