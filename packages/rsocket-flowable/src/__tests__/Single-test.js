/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

jest.mock('fbjs/lib/warning').useFakeTimers();

describe('Single', () => {
  const Single = require('../Single').default;
  const warning = require('fbjs/lib/warning');

  it('evaluates the single lazily', () => {
    const builder = jest.fn();
    const single = new Single(builder);
    expect(builder.mock.calls.length).toBe(0);
    single.subscribe();
    expect(builder.mock.calls.length).toBe(1);
  });

  it('calls onSubscribe when subscribed', () => {
    const builder = jest.fn(subscriber => subscriber.onSubscribe());
    const single = new Single(builder);
    expect(builder.mock.calls.length).toBe(0);
    const onSubscribe = jest.fn();
    single.subscribe({onSubscribe});
    expect(onSubscribe.mock.calls.length).toBe(1);
    expect(typeof onSubscribe.mock.calls[0][0]).toBe('function');
  });

  it('calls onComplete for synchronous values', () => {
    const single = new Single(subscriber => {
      subscriber.onSubscribe();
      subscriber.onComplete(42);
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(1);
    expect(onComplete.mock.calls[0][0]).toBe(42);
    expect(onError.mock.calls.length).toBe(0);
  });

  it('calls onComplete for async values', () => {
    const single = new Single(subscriber => {
      subscriber.onSubscribe();
      setTimeout(() => subscriber.onComplete(42), 1);
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(0);
    jest.runAllTimers();
    expect(onComplete.mock.calls.length).toBe(1);
    expect(onComplete.mock.calls[0][0]).toBe(42);
    expect(onError.mock.calls.length).toBe(0);
  });

  it('calls onError if the lambda throws', () => {
    const error = new Error('wtf');
    const single = new Single(subscriber => {
      throw error;
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onError for synchronous errors', () => {
    const error = new Error('wtf');
    const single = new Single(subscriber => {
      subscriber.onError(error);
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onError for asynchronous errors', () => {
    const error = new Error('wtf');
    const single = new Single(subscriber => {
      setTimeout(() => subscriber.onError(error), 1);
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(0);
    jest.runAllTimers();
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0][0]).toBe(error);
  });

  it('calls onError if the onComplete callback throws', () => {
    const single = new Single(subscriber => {
      subscriber.onSubscribe();
      subscriber.onComplete(42);
    });
    const error = new Error('wtf');
    const onComplete = jest.fn(() => {
      throw error;
    });
    const onError = jest.fn();
    single.subscribe({onComplete, onError});
    expect(onComplete.mock.calls.length).toBe(1);
    expect(onError.mock.calls.length).toBe(1);
    expect(onError.mock.calls[0][0]).toBe(error);
  });

  it('cancels callbacks when cancelled', () => {
    let subscriber;
    const single = new Single(_subscriber => {
      subscriber = _subscriber;
      subscriber.onSubscribe();
    });
    const onComplete = jest.fn();
    const onError = jest.fn();
    const onSubscribe = jest.fn();
    single.subscribe({onComplete, onError, onSubscribe});
    // cancel the single
    onSubscribe.mock.calls[0][0]();
    // completing/erroring should be ignored (warns)
    expect(warning.mock.calls.length).toBe(0);
    subscriber.onComplete();
    subscriber.onError(new Error('wtf'));
    expect(warning.mock.calls.length).toBe(2);
    expect(onComplete.mock.calls.length).toBe(0);
    expect(onError.mock.calls.length).toBe(0);
    expect(onSubscribe.mock.calls.length).toBe(1);
  });

  it('calls teardown logic when cancelled', () => {
    const cancel = jest.fn();
    const single = new Single(subscriber => {
      subscriber.onSubscribe(cancel);
    });
    const onSubscribe = jest.fn();
    single.subscribe({onSubscribe});
    expect(cancel.mock.calls.length).toBe(0);
    onSubscribe.mock.calls[0][0](); // call cancellation
    expect(cancel.mock.calls.length).toBe(1);
    onSubscribe.mock.calls[0][0](); // should be no-op
    expect(cancel.mock.calls.length).toBe(1);
  });

  it('does not call teardown logic after completion', () => {
    const cancel = jest.fn();
    const single = new Single(subscriber => {
      subscriber.onSubscribe(cancel);
      subscriber.onComplete();
    });
    const onSubscribe = jest.fn();
    single.subscribe({onSubscribe});
    onSubscribe.mock.calls[0][0](); // call cancellation
    expect(cancel.mock.calls.length).toBe(0);
  });

  it('does not call teardown logic after an error', () => {
    const cancel = jest.fn();
    const single = new Single(subscriber => {
      subscriber.onSubscribe(cancel);
      subscriber.onError(new Error('wtf'));
    });
    const onSubscribe = jest.fn();
    single.subscribe({onSubscribe});
    onSubscribe.mock.calls[0][0](); // call cancellation
    expect(cancel.mock.calls.length).toBe(0);
  });

  describe('of()', () => {
    it('completes with the given value', () => {
      const single = Single.of(42);
      const onComplete = jest.fn();
      single.subscribe({onComplete});
      expect(onComplete.mock.calls.length).toBe(1);
      expect(onComplete.mock.calls[0][0]).toBe(42);
    });
  });

  describe('map()', () => {
    it('maps values', () => {
      const single = new Single(subscriber => {
        subscriber.onSubscribe();
        subscriber.onComplete(3);
      }).map(x => x * x);
      const onComplete = jest.fn();
      const onError = jest.fn();
      single.subscribe({onComplete, onError});
      jest.runAllTimers();
      expect(onComplete.mock.calls.length).toBe(1);
      expect(onComplete.mock.calls[0][0]).toBe(9);
      expect(onError.mock.calls.length).toBe(0);
    });

    it('passes through errors', () => {
      const error = new Error('wtf');
      const single = new Single(subscriber => {
        subscriber.onError(error);
      }).map(x => x * x);
      const onComplete = jest.fn();
      const onError = jest.fn();
      single.subscribe({onComplete, onError});
      jest.runAllTimers();
      expect(onComplete.mock.calls.length).toBe(0);
      expect(onError.mock.calls.length).toBe(1);
      expect(onError.mock.calls[0][0]).toBe(error);
    });

    it('calls onError if the mapping function throws', () => {
      const error = new Error('wtf');
      const single = new Single(subscriber => {
        subscriber.onSubscribe();
        subscriber.onComplete(3);
      }).map(x => {
        throw error;
      });
      const onComplete = jest.fn();
      const onError = jest.fn();
      single.subscribe({onComplete, onError});
      jest.runAllTimers();
      expect(onComplete.mock.calls.length).toBe(0);
      expect(onError.mock.calls.length).toBe(1);
      expect(onError.mock.calls[0][0]).toBe(error);
    });

    it('cancels the original single', () => {
      const cancel = jest.fn();
      const single = new Single(subscriber => {
        subscriber.onSubscribe(cancel);
      }).map(x => x + x);
      const onSubscribe = jest.fn();
      single.subscribe({onSubscribe});
      expect(cancel.mock.calls.length).toBe(0);
      onSubscribe.mock.calls[0][0](); // call cancellation
      expect(cancel.mock.calls.length).toBe(1);
    });
  });
});
