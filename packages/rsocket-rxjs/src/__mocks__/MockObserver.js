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

import emptyFunction from 'fbjs/lib/emptyFunction';

import {Observer, PartialObserver} from 'rxjs';

export function genMockObserver<T>(
  partialObserver: PartialObserver<T> = {},
): Observer<T> {
  const observer: Observer = {
    complete: jest.fn(partialObserver.complete || emptyFunction),
    error: jest.fn(partialObserver.error || emptyFunction),
    next: jest.fn(partialObserver.next || emptyFunction),
  };
  observer.mockClear = () => {
    observer.complete.mockClear();
    observer.error.mockClear();
    observer.next.mockClear();
  };
  return observer;
}
