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

import FlowableProcessor from '../FlowableProcessor';
import {genMockSubscriber} from '../__mocks__/MockFlowableSubscriber';

describe('FlowableProcessor', () => {
  describe('when subscribe hasnt been called', () => {
    let processor;

    beforeEach(() => {
      processor = new FlowableProcessor();
      processor._sink = genMockSubscriber();
    });

    it('onNext is a noop call', () => {
      processor.onNext();
      expect(processor._sink.onNext.mock.calls.length).toBe(0);
    });

    it('onComplete is a noop call', () => {
      processor.onComplete();
      expect(processor._sink.onComplete.mock.calls.length).toBe(0);
    });

    it('onError is a noop call', () => {
      processor.onError();
      expect(processor._sink.onError.mock.calls.length).toBe(0);
    });
  });
});
