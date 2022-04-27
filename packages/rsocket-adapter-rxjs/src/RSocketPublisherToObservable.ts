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
} from "@viglucciio/rsocket-core";
import { Codec } from "@viglucciio/rsocket-messaging";
import { Observable, Subscriber, TeardownLogic, Unsubscribable } from "rxjs";

export default class RSocketPublisherToObservable<T>
  extends Observable<T>
  implements
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    Unsubscribable
{
  private observer: Subscriber<T>;
  private cancellable: Cancellable;

  constructor(
    private readonly exchangeFunction: (
      subscriber: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber
    ) => Cancellable,
    private readonly responseCodec?: Codec<T>
  ) {
    super();
  }

  onNext(payload: Payload, _isComplete: boolean): void {
    this.observer.next(this.responseCodec.decode(payload.data));
    this.observer.complete();
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
    this.cancellable.cancel();
  }

  protected _subscribe(subscriber: Subscriber<any>): TeardownLogic {
    if (this.observer) {
      throw new Error("Subscribing twice is disallowed");
    }

    this.observer = subscriber;
    this.cancellable = this.exchangeFunction(this);

    return this;
  }
}
