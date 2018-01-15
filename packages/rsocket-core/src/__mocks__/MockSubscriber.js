/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import emptyFunction from 'fbjs/lib/emptyFunction';

import type {Subscriber} from 'reactor-core-js/reactivestreams-spec';

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
        onComplete: jest.fn(partialSubscriber.onComplete || emptyFunction),
        onError: jest.fn(partialSubscriber.onError || emptyFunction),
        onNext: jest.fn(partialSubscriber.onNext || emptyFunction),
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
