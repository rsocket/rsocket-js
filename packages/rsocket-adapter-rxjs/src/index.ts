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
 *
 */

"use strict";

import { RequestFactory, Codec, Flux, Mono } from "@rsocket/requester";

import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
} from "@rsocket/core";

import {
  Observable,
  partition,
  concatMap,
  Unsubscribable,
  Observer,
  Subscription,
  Subscriber,
  TeardownLogic,
  SchedulerLike,
  asyncScheduler,
} from "rxjs";

function fireAndForgetRxAdapter<InputDataType>(
  rsocket: RSocket,
  metadata: Buffer,
  input: InputDataType | undefined,
  inputCodec: Codec<InputDataType>
): Observable<void> {
  return new MonoObservableSubscriber((s) =>
    rsocket.fireAndForget(
      {
        data: input ? inputCodec.encode(input) : Buffer.allocUnsafe(0),
        metadata,
      },
      s
    )
  );
}

function requestResponseRxAdapter<OutputDataType, InputDataType>(
  rsocket: RSocket,
  metadata: Buffer,
  input: InputDataType | undefined,
  inputCodec: Codec<InputDataType>,
  outputCodec: Codec<OutputDataType>
): Observable<OutputDataType> {
  return new MonoObservableSubscriber(
    (s) =>
      rsocket.requestResponse(
        {
          data: input ? inputCodec.encode(input) : Buffer.allocUnsafe(0),
          metadata,
        },
        s
      ),
    outputCodec
  );
}

function requestStreamRxAdapter<InputDataType, OutputDataType>(
  rsocket: RSocket,
  metadata: Buffer,
  input: InputDataType | undefined,
  inputCodec: Codec<InputDataType>,
  outputCodec: Codec<OutputDataType>
): Observable<OutputDataType> {
  return new FluxObservableSubscriber(
    (s, n) =>
      rsocket.requestStream(
        {
          data: input ? inputCodec.encode(input) : Buffer.allocUnsafe(0),
          metadata,
        },
        n,
        s
      ),
    256,
    outputCodec
  );
}

function requestChannelRxAdapter<InputDataType, OutputDataType>(
  rsocket: RSocket,
  metadata: Buffer,
  input: Observable<InputDataType>,
  inputCodec: Codec<InputDataType>,
  outputCodec: Codec<OutputDataType>
): Observable<OutputDataType> {
  const [firstValueObservable, restValuestObservable] = partition(
    input,
    (_value, index) => index === 0
  );

  return firstValueObservable.pipe(
    concatMap(
      (firstValue, n) =>
        new BufferingObserverToObservableProducer(
          (s) =>
            rsocket.requestChannel(
              {
                data: inputCodec.encode(firstValue),
                metadata,
              },
              n,
              false,
              s
            ),
          256,
          restValuestObservable,
          inputCodec,
          outputCodec
        ) as Observable<OutputDataType>
    )
  );
}

class MonoObservableSubscriber<T>
  extends Observable<T>
  implements
    Mono<T>,
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    Unsubscribable
{
  _type?: T;

  private subscriber: Subscriber<T>;
  private cancellable: Cancellable;

  constructor(
    private readonly call: (
      subscriber: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber
    ) => Cancellable,
    private readonly responseCodec?: Codec<T>
  ) {
    super();
  }

  onNext(payload: Payload, _isComplete: boolean): void {
    this.subscriber.next(this.responseCodec.decode(payload.data));
    this.subscriber.complete();
  }

  onError(error: Error): void {
    this.subscriber.error(error);
  }

  onComplete(): void {
    this.subscriber.complete();
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
    if (this.subscriber) {
      throw new Error("Subscribing twice is disallowed");
    }

    this.subscriber = subscriber;
    this.cancellable = this.call(this);

    return this;
  }
}

class FluxObservableSubscriber<T, C extends Requestable & Cancellable>
  extends Observable<T>
  implements
    Flux<T>,
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    Unsubscribable
{
  _type?: T;

  private readonly limit;
  private subscriber: Subscriber<T>;
  protected requester: C;

  private received: number;

  constructor(
    private readonly call: (
      subscriber: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber,
      n: number
    ) => C,
    private readonly prefetch: number,
    private readonly responseCodec?: Codec<T>,
    private readonly scheduler: SchedulerLike = asyncScheduler
  ) {
    super();

    this.limit = prefetch - (prefetch >> 2);
  }

  onNext(payload: Payload, isComplete: boolean): void {
    this.received++;
    this.subscriber.next(this.responseCodec.decode(payload.data));

    if (isComplete) {
      this.subscriber.complete();
      return;
    }

    if (this.received % this.limit) {
      this.scheduler.schedule(() => this.requester.request(this.limit));
      return;
    }
  }

  onError(error: Error): void {
    this.subscriber.error(error);
  }

  onComplete(): void {
    this.subscriber.complete();
  }

  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {}

  unsubscribe(): void {
    this.requester.cancel();
  }

  protected _subscribe(subscriber: Subscriber<any>): TeardownLogic {
    if (this.subscriber) {
      throw new Error("Subscribing twice is disallowed");
    }

    this.subscriber = subscriber;
    this.requester = this.call(this, this.prefetch);

    return this;
  }
}

interface BufferingObserverToObservableProducer<In, Out>
  extends Array<In>,
    FluxObservableSubscriber<
      Out,
      OnNextSubscriber & OnTerminalSubscriber & Requestable & Cancellable
    > {
  forEach(next: any): any;
}
class BufferingObserverToObservableProducer<In, Out>
  extends FluxObservableSubscriber<
    Out,
    OnNextSubscriber & OnTerminalSubscriber & Requestable & Cancellable
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
  private requested: number = 0;
  private wip: number = 0;

  private e: Error;
  private done: boolean;
  private cancelled: boolean;
  private subscription: Subscription;

  constructor(
    call: (
      s: OnNextSubscriber &
        OnTerminalSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable,
      n: number
    ) => OnNextSubscriber & OnTerminalSubscriber & Requestable & Cancellable,
    prefetch: number,
    private readonly restObservable: Observable<In>,
    private readonly inputCodec: Codec<In>,
    outputCodec: Codec<Out>,
    scheduler: SchedulerLike = asyncScheduler
  ) {
    super(call, prefetch, outputCodec, scheduler);
  }

  _subscribe(s: Subscriber<Out>): TeardownLogic {
    super._subscribe(s);
    this.subscription = this.restObservable.subscribe(this);

    return this;
  }

  next(value: In) {
    this.push(value);

    this.drain();
  }

  error(err: any) {
    if (this.done || this.cancelled) {
      return;
    }

    this.e = err;
    this.done = true;

    this.drain();
  }

  complete() {
    if (this.done || this.cancelled) {
      return;
    }

    this.done = true;

    this.drain();
  }

  request(n: number) {
    const requested = this.requested;
    this.requested = requested + n;

    if (this.wip == 0 && requested > 0) {
      return;
    }

    this.drain();
  }

  cancel(): void {
    if (this.done || this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.subscription.unsubscribe();

    this.drain();
  }

  private drain() {
    let m = this.wip;
    this.wip = m + 1;
    if (m) {
      return;
    }

    m = 1;

    for (;;) {
      let requested = this.requested;
      let delivered = 0;
      while (delivered < requested) {
        const next = this.shift();

        if (next == undefined) {
          if (this.done) {
            if (this.e) {
              this.requester.onError(this.e);
            } else {
              this.requester.onComplete();
            }
            return;
          }

          if (this.cancelled) {
            return;
          }
        }

        const isTerminated = this.length == 0 && this.done;
        this.requester.onNext(
          {
            data: this.inputCodec.encode(next),
          },
          isTerminated
        );

        if (isTerminated) {
          return;
        }

        delivered++;
      }

      this.requested -= delivered;
      if (m === this.wip) {
        this.wip = 0;
        return;
      }

      m = this.wip;
    }
  }
}

applyMixins(BufferingObserverToObservableProducer, [Array]);

// This can live anywhere in your codebase:
function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
          Object.create(null)
      );
    });
  });
}

export class RxRequestFactory<InputDataType, OutputDataType>
  implements
    RequestFactory<
      InputDataType,
      Observable<InputDataType> & Flux<InputDataType>,
      OutputDataType,
      Observable<void> & Mono<void>,
      Observable<OutputDataType> & Mono<OutputDataType>,
      Observable<OutputDataType> & Flux<OutputDataType>
    >
{
  private static readonly _instance: RxRequestFactory<any, any> =
    new RxRequestFactory();

  static instance<InputDataType, OutputDataType>(): RxRequestFactory<
    InputDataType,
    OutputDataType
  > {
    return RxRequestFactory._instance;
  }

  fireAndForget(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>
  ) => Observable<void> & Mono<void> {
    return fireAndForgetRxAdapter;
  }

  requestResponse(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>
  ) => Observable<OutputDataType> & Mono<OutputDataType> {
    return requestResponseRxAdapter;
  }

  stream(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>,
    initialRequestN: number
  ) => Observable<OutputDataType> & Flux<OutputDataType> {
    return requestStreamRxAdapter;
  }

  channel(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: Observable<InputDataType> & Flux<InputDataType>,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>,
    initialRequestN: number
  ) => Observable<OutputDataType> & Flux<OutputDataType> {
    return requestChannelRxAdapter;
  }
}
