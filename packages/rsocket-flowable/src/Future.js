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

import warning from 'fbjs/lib/warning';

export type Source<T> = (subject: IFutureSubject<T>) => void;

export type CancelCallback = () => void;
export interface IPartialFutureSubscriber<T> {
  +onComplete?: (value: T) => void,
  +onError?: (error: Error) => void,
  +onSubscribe?: (cancel: CancelCallback) => void,
}
export interface IFutureSubscriber<T> {
  +onComplete: (value: T) => void,
  +onError: (error: Error) => void,
  +onSubscribe: (cancel: CancelCallback) => void,
}
export interface IFutureSubject<T> {
  +onComplete: (value: T) => void,
  +onError: (error: Error) => void,
  +onSubscribe: (cancel?: ?CancelCallback) => void,
}

/**
 * Represents a lazy computation that will either produce a value of type T
 * or fail with an error. Calling `subscribe()` starts the
 * computation and returns a subscription object, which has an `unsubscribe()`
 * method that can be called to prevent completion/error callbacks from being
 * invoked and, where supported, to also cancel the computation.
 * Implementations may optionally implement cancellation; if they do not
 * `cancel()` is a no-op.
 *
 * Note: Unlike Promise, callbacks (onComplete/onError) may be invoked
 * synchronously.
 *
 * Example:
 *
 * ```
 * const value = new Future(subscriber => {
 *   const id = setTimeout(
 *     () => subscriber.onComplete('Hello!'),
 *     250
 *   );
 *   // Optional: Call `onSubscribe` with a cancellation callback
 *   subscriber.onSubscribe(() => clearTimeout(id));
 * });
 *
 * // Start the computation. onComplete will be called after the timeout
 * // with 'hello'  unless `cancel()` is called first.
 * value.subscribe({
 *   onComplete: value => console.log(value),
 *   onError: error => console.error(error),
 *   onSubscribe: cancel => ...
 * });
 * ```
 */
export default class Future<T> {
  _source: Source<T>;

  static of<U>(value: U): Future<U> {
    return new Future(subscriber => {
      subscriber.onSubscribe();
      subscriber.onComplete(value);
    });
  }

  constructor(source: Source<T>) {
    this._source = source;
  }

  subscribe(partialSubscriber?: ?IPartialFutureSubscriber<T>): void {
    const subscriber = new FutureSubscriber(partialSubscriber);
    try {
      this._source(subscriber);
    } catch (error) {
      subscriber.onError(error);
    }
  }

  /**
   * Return a new Future that resolves to the value of this Future applied to
   * the given mapping function.
   */
  map<R>(fn: (data: T) => R): Future<R> {
    return new Future(subscriber => {
      return this._source({
        onComplete: value => subscriber.onComplete(fn(value)),
        onError: error => subscriber.onError(error),
        onSubscribe: cancel => subscriber.onSubscribe(cancel),
      });
    });
  }
}

/**
 * @private
 */
class FutureSubscriber<T> implements IFutureSubscriber<T> {
  _active: boolean;
  _started: boolean;
  _subscriber: IPartialFutureSubscriber<T>;

  constructor(subscriber?: ?IPartialFutureSubscriber<T>) {
    this._active = false;
    this._started = false;
    this._subscriber = subscriber || {};
  }

  onComplete(value: T): void {
    if (!this._active) {
      warning(
        false,
        'Future: Invalid call to onComplete(): %s.',
        this._started
          ? 'onComplete/onError was already called'
          : 'onSubscribe has not been called',
      );
      return;
    }
    this._active = false;
    this._started = true;
    try {
      if (this._subscriber.onComplete) {
        this._subscriber.onComplete(value);
      }
    } catch (error) {
      if (this._subscriber.onError) {
        this._subscriber.onError(error);
      }
    }
  }

  onError(error: Error): void {
    if (this._started && !this._active) {
      warning(
        false,
        'Future: Invalid call to onError(): %s.',
        this._active
          ? 'onComplete/onError was already called'
          : 'onSubscribe has not been called',
      );
      return;
    }
    this._active = false;
    this._started = true;
    this._subscriber.onError && this._subscriber.onError(error);
  }

  onSubscribe(cancel?: ?CancelCallback): void {
    if (this._started) {
      warning(false, 'Future: Invalid call to onSubscribe(): already called.');
      return;
    }
    this._active = true;
    this._started = true;
    try {
      this._subscriber.onSubscribe &&
        this._subscriber.onSubscribe(() => {
          if (!this._active) {
            return;
          }
          this._active = false;
          cancel && cancel();
        });
    } catch (error) {
      this.onError(error);
    }
  }
}
