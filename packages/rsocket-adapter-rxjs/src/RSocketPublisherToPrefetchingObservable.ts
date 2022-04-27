/*
 * Copyright 2021-2022 the original author or authors.
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
"use strict";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "rsocket-core";
import { Codec } from "rsocket-messaging";
import {
  asyncScheduler,
  Observable,
  SchedulerLike,
  Subscriber,
  TeardownLogic,
  Unsubscribable,
} from "rxjs";

export default class RSocketPublisherToPrefetchingObservable<
    T,
    TSignalSender extends Requestable & Cancellable & OnExtensionSubscriber
  >
  extends Observable<T>
  implements
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    Unsubscribable
{
  private readonly limit;
  private observer: Subscriber<T>;
  protected subscriber: TSignalSender;

  private received: number = 0;

  constructor(
    private readonly exchangeFunction: (
      subscriber: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber,
      n: number
    ) => TSignalSender,
    protected readonly prefetch: number,
    private readonly responseCodec?: Codec<T>,
    protected readonly scheduler: SchedulerLike = asyncScheduler
  ) {
    super();

    this.limit = prefetch - (prefetch >> 2);
  }

  onNext(payload: Payload, isComplete: boolean): void {
    this.received++;
    this.observer.next(this.responseCodec.decode(payload.data));

    if (isComplete) {
      this.observer.complete();
      return;
    }

    if (this.received % this.limit === 0) {
      this.scheduler.schedule(() => this.subscriber.request(this.limit));
      return;
    }
  }

  onError(error: Error): void {
    this.observer.error(error);
  }

  onComplete(): void {
    this.observer.complete();
  }

  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {}

  unsubscribe(): void {
    this.subscriber.cancel();
  }

  protected _subscribe(observer: Subscriber<any>): TeardownLogic {
    if (this.observer) {
      throw new Error("Subscribing twice is disallowed");
    }

    this.observer = observer;
    this.subscriber = this.exchangeFunction(this, this.prefetch);

    return this;
  }
}
