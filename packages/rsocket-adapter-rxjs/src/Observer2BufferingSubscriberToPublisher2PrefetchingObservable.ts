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
  Requestable,
} from "rsocket-core";
import { Codec } from "rsocket-messaging";
import {
  asyncScheduler,
  Observable,
  Observer,
  SchedulerLike,
  Subscriber,
  TeardownLogic,
  Unsubscribable,
} from "rxjs";
import ObserverToBufferingRSocketSubscriber from "./ObserverToBufferingRSocketSubscriber";
import RSocketPublisherToPrefetchingObservable from "./RSocketPublisherToPrefetchingObservable";
import { applyMixins } from "./Utils";

interface Observer2BufferingSubscriberToPublisher2PrefetchingObservable<In, Out>
  extends ObserverToBufferingRSocketSubscriber<In>,
    RSocketPublisherToPrefetchingObservable<
      Out,
      OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    > {
  subscriber: OnNextSubscriber &
    OnTerminalSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable;
  forEach(next: any): any;
}

class Observer2BufferingSubscriberToPublisher2PrefetchingObservable<In, Out>
  extends RSocketPublisherToPrefetchingObservable<
    Out,
    OnNextSubscriber &
      OnTerminalSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable
  >
  implements
    Observer<In>,
    Unsubscribable,
    OnNextSubscriber,
    OnTerminalSubscriber,
    OnExtensionSubscriber,
    Requestable,
    Cancellable
{
  constructor(
    exchangeFunction: (
      s: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable,
      n: number
    ) => OnNextSubscriber &
      OnTerminalSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable,
    prefetch: number,
    private readonly restObservable: Observable<In>,
    inputCodec: Codec<In>,
    outputCodec: Codec<Out>,
    scheduler: SchedulerLike = asyncScheduler
  ) {
    super(exchangeFunction, prefetch, outputCodec, scheduler);
    ObserverToBufferingRSocketSubscriber.call(this, 0, undefined, inputCodec);
  }

  _subscribe(s: Subscriber<Out>): TeardownLogic {
    super._subscribe(s);

    this.restObservable.subscribe(this);

    return this;
  }

  unsubscribe(): void {
    this.subscriber.cancel();
    super.unsubscribe();
  }
}

applyMixins(Observer2BufferingSubscriberToPublisher2PrefetchingObservable, [
  ObserverToBufferingRSocketSubscriber,
]);

export default Observer2BufferingSubscriberToPublisher2PrefetchingObservable;
