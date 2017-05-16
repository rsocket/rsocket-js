/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import {every} from '../FlowableTimer';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';

jest.useFakeTimers();

describe('FlowableTimer', () => {
  describe('every()', () => {
    it('publishes values every interval', () => {
      const interval = 10;
      const subscriber = genMockSubscriber({
        onSubscribe(sub) {
          sub.request(2);
        },
      });
      every(interval).subscribe(subscriber);

      jest.runTimersToTime(interval - 1);
      expect(subscriber.onNext.mock.calls.length).toBe(0);

      jest.runTimersToTime(1);
      expect(subscriber.onNext.mock.calls.length).toBe(1);

      jest.runTimersToTime(interval - 1);
      expect(subscriber.onNext.mock.calls.length).toBe(1);

      jest.runTimersToTime(1);
      expect(subscriber.onNext.mock.calls.length).toBe(2);

      // does not publish more than requested
      jest.runTimersToTime(interval + 1);
      expect(subscriber.onNext.mock.calls.length).toBe(2);
    });

    it('publishes more value on request(), on a fixed interval', () => {
      const interval = 10;
      let subscription;
      const subscriber = genMockSubscriber({
        onSubscribe(_subscription) {
          subscription = _subscription;
          subscription.request(2);
        },
      });
      every(interval).subscribe(subscriber);

      // initial 2 values published
      jest.runTimersToTime(interval * 2);
      expect(subscriber.onNext.mock.calls.length).toBe(2);

      // request halfway through an interval
      jest.runTimersToTime(Math.ceil(interval / 2));
      subscription.request(1);
      // value not yet published
      expect(subscriber.onNext.mock.calls.length).toBe(2);

      // value published on next interval
      jest.runTimersToTime(Math.ceil(interval / 2));
      expect(subscriber.onNext.mock.calls.length).toBe(3);
    });

    it('queues overlapping requests', () => {
      const interval = 10;
      const subscriber = genMockSubscriber({
        onSubscribe(sub) {
          // Make a second request before the first completes:
          // should behave the  same as request(2) above
          sub.request(1);
          setTimeout(() => sub.request(1), Math.ceil(interval / 2));
        },
      });
      every(interval).subscribe(subscriber);

      jest.runTimersToTime(interval - 1);
      expect(subscriber.onNext.mock.calls.length).toBe(0);

      jest.runTimersToTime(1);
      expect(subscriber.onNext.mock.calls.length).toBe(1);

      jest.runTimersToTime(interval - 1);
      expect(subscriber.onNext.mock.calls.length).toBe(1);

      jest.runTimersToTime(1);
      expect(subscriber.onNext.mock.calls.length).toBe(2);

      // does not publish more than requested
      jest.runTimersToTime(interval + 1);
      expect(subscriber.onNext.mock.calls.length).toBe(2);
    });
  });
});
