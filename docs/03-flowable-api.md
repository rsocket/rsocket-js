# Flowable API

`rsocket-flowable` provides the `Flowable` and `Single` types:

## Flowable (class)

This class implements the ReactiveStream `Publisher` interface with Rx-style operators.

### Example

This example creates a `Flowable` that publishes the numbers 0, 1, 2, 3 on demand and then
completes.

```javascript
const flowable = new Flowable(subscriber => {
  // lambda is not executed until `subscribe()` is called
  const values = [0, 1, 2, 3];
  subscriber.onSubscribe({
    cancel: () => {/* no-op */},
    request: n => {
      while (n--) {
        if (values.length) {
          const next = values.shift();
          // Can't publish values until request() is called
          subscriber.onNext(next);
        } else {
          subscriber.onComplete();
          break;
        }
      }
    }
  });
});
flowable.subscribe({
  onComplete: () => console.log('done'),
  onError: error => console.error(error),
  onNext: value => console.log(value),
  // Nothing happens until `request(n)` is called
  onSubscribe: sub => sub.request(4),
});
// logs '0', '1', '2', '3', 'done'

```

### constructor (function)

```javascript
class Flowable<T> {
  constructor(source: Source<T>)
}

type Source<T> = (subscriber: Subscriber<T>) => void;

type Subscriber<T> = {
  onComplete: () => void,
  onError: (error: Error) => void,
  onNext: (data: T) => void,
  onSubscribe: (subscription: Subscription) => void,
};

type Subscription = {
  cancel(): void,
  request(n: number): void,
};
```

### subscribe() (method)

This method connects the Flowable (publisher) to a subscriber of values. Subscribing alone
does not indicate demand: rather, it connects publisher & subscriber and allows
the subscriber to begin expressing demand for values via a `Subscription`
object. Note that `PartialSubscriber` differs from the above `Subscriber` only
in that methods are optional. 

```javascript
subscribe(subscriber: PartialSubscriber<T>): void

type PartialSubscriber<T> = {
  onComplete?: () => void,
  onError?: (error: Error) => void,
  onNext?: (data: T) => void,
  onSubscribe?: (subscription: Subscription) => void,
};
```

### map() (method)

This method applies a transform function to values produced by this `Flowable`. This is similar to
`Array.prototype.map`, `Observable.prototype.map`, etc.

```javascript
map<U>(fn: (data: T) => U): Flowable<U>
```

## Single (class)

This class is similar to `Flowable` but represents a single value that is produced on demand
(when subscribed). From a practical perspective this is a lazy, cancellable
Promise that supports operators (e.g. `map()`).

### Example: Network Request

This example creates a `Single` that resolves to the result of an XHR request. The `fetch`
API does not support cancellation, so no cancel callback is passed to
`onSubscribe()`. The user may still call `cancel()` to ignore the fetch 
results and stop `onComplete()` or `onError()` from being called.

```javascript
const single = new Single(subscriber => {
  fetch('https://...').then(resp => {
    resp.json().then(
      data => subscriber.onComplete(data),
      error => subscriber.onError(error),
    );
  });
  subscriber.onSubscribe();
});
single.subscribe({
  onComplete: data => console.log(data),
  onError: error => console.error(error),
  onSubscribe: cancel => {/* call cancel() to stop onComplete/onError */},
});
```

### Example: Timer

This example creates a `Single` that resolves to a string after a timeout, passing a
cancellation callback to stop the timer in case the user cancels the `Single`:

```javascript
const single = new Single(subscriber => {
  const id = setTimeout(
    () => subscriber.onComplete('hello!'),
    250,
  );
  // Cancellation callback is optional
  subscriber.onSubscribe(() => clearTimeout(id));
});
single.subscribe({
  onComplete: data => console.log(data),
  onError: error => console.error(error),
  onSubscribe: cancel => {/* call cancel() to stop onComplete/onError */},
});
```

### constructor (function)

```javascript
class Single<T> {
  constructor(source: Source<T>)
}

type Source<T> = (subscriber: Subscriber<T>) => void;

type Subscriber<T> = {
  onComplete: (data: T) => void,
  onError: (error: Error) => void,
  onSubscribe: (cancel: CancelCallback) => void,
};

type CancelCallback = () => void;
```

### subscribe() (method)

This method connects the `Single` to a subscriber of values. Unlike `Flowable`, with `Single` a subscribe
also implicitly indicates demand. `PartialSubscriber` differs from `Subscriber`
only in that methods are optional.

```javascript
subscribe(subscriber: PartialSubscriber<T>): void

type PartialSubscriber<T> = {
  onComplete?: (data: T) => void,
  onError?: (error: Error) => void,
  onSubscribe?: (cancel: CancelCallback) => void,
}
```

### map() (method)

This method applies a transform function to values produced by this `Single`. This is similar to
`Array.prototype.map`, `Observable.prototype.map`, etc.

```javascript
map<U>(fn: (data: T) => U): Single<U>
```
