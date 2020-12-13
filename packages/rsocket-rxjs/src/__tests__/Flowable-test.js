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

import toObservable from '../ObservableFlowable';

jest.mock('fbjs/lib/warning').useFakeTimers();

describe('ObservableFlowable', () => {
  const {Flowable} = require('rsocket-flowable');
  const {genMockObserver} = require('../__mocks__/MockObserver');
  const warning = require('fbjs/lib/warning');

  beforeEach(() => {
    warning.mockClear();
  });

  it('calls cancel()', () => {
    const request = jest.fn();
    const cancel = jest.fn();
    const source = subscriber => subscriber.onSubscribe({cancel, request});
    const flowable = new Flowable(source);
    const observable = toObservable(flowable);
    observable.subscribe().unsubscribe();
    expect(request.mock.calls.length).toBe(1);
    expect(cancel.mock.calls.length).toBe(1);
  });

  it('calls request()', () => {
    const request = jest.fn();
    const source = subscriber => subscriber.onSubscribe({request});
    const flowable = new Flowable(source);
    const observable = toObservable(flowable);
    observable.subscribe();
    expect(request.mock.calls.length).toBe(1);
    expect(request.mock.calls[0][0]).toBe(256);
  });

  it('calls request(42)', () => {
    const request = jest.fn();
    const source = subscriber => subscriber.onSubscribe({request});
    const flowable = new Flowable(source);
    const observable = toObservable(flowable, 42);
    observable.subscribe();
    expect(request.mock.calls.length).toBe(1);
    expect(request.mock.calls[0][0]).toBe(42);
  });

  describe('onComplete()', () => {
    it('ignores and warns if called before onSubscribe()', () => {
      const source = sub => {
        sub.onComplete();
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(1);
      expect(mockObserver.complete.mock.calls.length).toBe(0);
      expect(mockObserver.error.mock.calls.length).toBe(0);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });

    it('calls subscriber.onComplete() when completed', () => {
      const request = jest.fn();
      const cancel = jest.fn();
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onComplete();
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(0);
      expect(mockObserver.complete.mock.calls.length).toBe(1);
      expect(mockObserver.error.mock.calls.length).toBe(0);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });

    it('calls subscriber.onError() if onComplete() throws', () => {
      const request = jest.fn();
      const cancel = jest.fn();
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onComplete();
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const error = new Error('wtf');
      const subscriber = genMockObserver({
        complete() {
          throw error;
        },
      });

      observable.subscribe(subscriber);

      expect(warning.mock.calls.length).toBe(0);
      expect(subscriber.complete.mock.calls.length).toBe(1);
      expect(subscriber.error.mock.calls.length).toBe(0);
      expect(subscriber.next.mock.calls.length).toBe(0);
    });

    it('ignores and warns if called after onError()', () => {
      const cancel = jest.fn();
      const request = jest.fn();
      const error = new Error('wtf');
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onError(error);
        sub.onComplete();
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(1);
      expect(mockObserver.complete.mock.calls.length).toBe(0);
      expect(mockObserver.error.mock.calls.length).toBe(1);
      expect(mockObserver.error.mock.calls[0][0]).toBe(error);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });
  });

  describe('onError()', () => {
    it('calls when rejected explicitly', () => {
      const cancel = jest.fn();
      const request = jest.fn();
      const error = new Error('wtf');
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onError(error);
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(0);
      expect(mockObserver.complete.mock.calls.length).toBe(0);
      expect(mockObserver.error.mock.calls.length).toBe(1);
      expect(mockObserver.error.mock.calls[0][0]).toBe(error);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });

    it('should not throws if onError() throws', () => {
      const cancel = jest.fn();
      const request = jest.fn();
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onError(new Error('foo'));
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const error = new Error('wtf');
      const mockObserver = genMockObserver({
        error() {
          throw error;
        },
      });
      observable.subscribe(mockObserver);
    });

    it('ignores and warns if called after onComplete()', () => {
      const cancel = jest.fn();
      const request = jest.fn();
      const error = new Error('wtf');
      const source = sub => {
        sub.onSubscribe({cancel, request});
        sub.onComplete();
        sub.onError(error);
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(1);
      expect(mockObserver.complete.mock.calls.length).toBe(1);
      expect(mockObserver.error.mock.calls.length).toBe(0);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });
  });

  describe('onNext()', () => {
    it('ignores and warns if called before onSubscribe()', () => {
      const source = sub => sub.onNext(42);
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(1);
      expect(mockObserver.complete.mock.calls.length).toBe(0);
      expect(mockObserver.error.mock.calls.length).toBe(0);
      expect(mockObserver.next.mock.calls.length).toBe(0);
    });

    it('calls when a value is requested', () => {
      const request = jest.fn();
      const source = sub => {
        sub.onSubscribe({request});
        sub.onNext(42);
      };
      const flowable = new Flowable(source);
      const observable = toObservable(flowable);
      const mockObserver = genMockObserver();

      observable.subscribe(mockObserver);

      expect(warning.mock.calls.length).toBe(0);
      expect(mockObserver.complete.mock.calls.length).toBe(0);
      expect(mockObserver.error.mock.calls.length).toBe(0);
      expect(mockObserver.next.mock.calls.length).toBe(1);
      expect(mockObserver.next.mock.calls[0][0]).toBe(42);
      expect(request.mock.calls.length).toBe(1);
      expect(request.mock.calls[0][0]).toBe(256);
    });
  });
});
