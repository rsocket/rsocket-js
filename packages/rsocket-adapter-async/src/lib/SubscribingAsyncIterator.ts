import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "rsocket-core";
import { Codec } from "rsocket-messaging";

export default class SubscribingAsyncIterator<T>
  implements
    AsyncIterator<T>,
    OnNextSubscriber,
    OnTerminalSubscriber,
    OnExtensionSubscriber
{
  private values: { payload: Payload; isComplete: boolean }[] = [];
  private produced: number = 0;
  private isDone: boolean = false;
  private error: Error;

  private limit: number;
  private resolve: (
    result: Promise<IteratorResult<T, any>> | IteratorResult<T>
  ) => void;
  private reject: (reason: any) => void;

  constructor(
    private subscription: Requestable & Cancellable,
    private prefetch: number,
    private responseCodec: Codec<T>
  ) {
    this.limit = prefetch - (prefetch >> 2);
  }

  onComplete(): void {
    this.isDone = true;

    const resolve = this.resolve;
    if (resolve !== undefined) {
      this.resolve = undefined;
      this.reject = undefined;
      resolve({ done: this.isDone, value: undefined });
    }
  }

  onError(error: Error): void {
    this.isDone = true;
    this.error = error;

    const reject = this.reject;
    if (reject !== undefined) {
      this.resolve = undefined;
      this.reject = undefined;
      reject(error);
    }
  }

  onExtension(
    extendedType: number,
    content: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void {}

  onNext(payload: Payload, isComplete: boolean): void {
    const resolve = this.resolve;
    if (resolve === undefined) {
      this.values.push({ payload, isComplete });
      return;
    }

    this.resolve = undefined;
    this.reject = undefined;

    if (++this.produced === this.limit) {
      this.produced = 0;
      this.subscription.request(this.limit);
    }

    if (isComplete === true) {
      this.isDone = isComplete;
    }

    resolve({
      done: false,
      value: this.responseCodec.decode(payload.data),
    });
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();

    if (value === undefined) {
      if (this.isDone) {
        if (this.error !== undefined) {
          return Promise.reject(this.error);
        } else {
          return Promise.resolve({ done: true, value: undefined });
        }
      }

      return new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }

    if (++this.produced === this.limit) {
      this.produced = 0;
      this.subscription.request(this.limit);
    }

    if (value.isComplete === true) {
      this.isDone = value.isComplete;
    }

    return Promise.resolve({
      done: false,
      value: this.responseCodec.decode(value.payload.data),
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }

  return(): Promise<IteratorResult<T, void>> {
    this.subscription.cancel();
    return Promise.resolve(null);
  }
}
