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
        intervalId = setInterval(
          () => {
            if (pending > 0) {
              if (pending !== Number.MAX_SAFE_INTEGER) {
                pending--;
              }
              subscriber.onNext(Date.now());
            }
          },
          ms,
        );
      },
    });
  });
}
