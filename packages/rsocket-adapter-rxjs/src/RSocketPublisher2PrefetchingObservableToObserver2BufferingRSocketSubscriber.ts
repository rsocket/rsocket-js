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
} from "@viglucciio/rsocket-core";
import { Codec } from "@viglucciio/rsocket-messaging";
import { asyncScheduler, SchedulerLike, Subscriber, TeardownLogic } from "rxjs";
import ObserverToBufferingRSocketSubscriber from "./ObserverToBufferingRSocketSubscriber";
import RSocketPublisherToPrefetchingObservable from "./RSocketPublisherToPrefetchingObservable";
import { applyMixins } from "./Utils";

interface RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber<
  IN,
  OUT
> extends ObserverToBufferingRSocketSubscriber<OUT>,
    RSocketPublisherToPrefetchingObservable<
      IN,
      OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    > {
  readonly subscriber: OnNextSubscriber &
    OnTerminalSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable;
  forEach(x: any);
}

class RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber<
  IN,
  OUT
> extends RSocketPublisherToPrefetchingObservable<
  IN,
  OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable
> {
  constructor(
    readonly firstPayload: Payload,
    readonly isCompleted: boolean,
    subscriber: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable,
    requested: number,
    prefetch: number,
    outputCodec: Codec<IN>,
    inputCodec: Codec<OUT>,
    scheduler: SchedulerLike = asyncScheduler
  ) {
    super(() => subscriber, prefetch, outputCodec, scheduler);
    ObserverToBufferingRSocketSubscriber.call(
      this,
      requested,
      subscriber,
      inputCodec
    );
  }

  protected _subscribe(observer: Subscriber<any>): TeardownLogic {
    super._subscribe(observer);

    this.onNext(this.firstPayload, this.isCompleted);

    if (!this.isCompleted) {
      this.scheduler.schedule(() => this.subscriber.request(this.prefetch - 1));
    }

    return this;
  }
}

applyMixins(
  RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber,
  [ObserverToBufferingRSocketSubscriber]
);

export default RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber;
