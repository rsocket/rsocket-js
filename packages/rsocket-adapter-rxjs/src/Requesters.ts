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
  encodeCompositeMetadata,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Requestable,
  RSocket,
} from "rsocket-core";
import { Codec } from "rsocket-messaging";
import {
  asyncScheduler,
  concatMap,
  Observable,
  partition,
  share,
  SchedulerLike,
  Subject,
  take,
} from "rxjs";
import Observer2BufferingSubscriberToPublisher2PrefetchingObservable from "./Observer2BufferingSubscriberToPublisher2PrefetchingObservable";
import RSocketPublisherToObservable from "./RSocketPublisherToObservable";
import RSocketPublisherToPrefetchingObservable from "./RSocketPublisherToPrefetchingObservable";

export function fireAndForget<TData>(
  data: TData,
  inputCodec: Codec<TData>
): (
  rsocket: RSocket,
  metadata?: Map<string | number | WellKnownMimeType, Buffer>
) => Observable<void> {
  return (
    rsocket: RSocket,
    metadata?: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const encodedMetadata = metadata ? encodeCompositeMetadata(metadata) : null;
    return new RSocketPublisherToObservable((s) =>
      rsocket.fireAndForget(
        {
          data: data ? inputCodec.encode(data) : Buffer.allocUnsafe(0),
          metadata: encodedMetadata,
        },
        s
      )
    );
  };
}

export function requestResponse<TData, RData>(
  data: TData,
  inputCodec: Codec<TData>,
  outputCodec: Codec<RData>
): (
  rsocket: RSocket,
  metadata?: Map<string | number | WellKnownMimeType, Buffer>
) => Observable<RData> {
  return (
    rsocket: RSocket,
    metadata?: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const encodedMetadata = metadata ? encodeCompositeMetadata(metadata) : null;
    return new RSocketPublisherToObservable(
      (s) =>
        rsocket.requestResponse(
          {
            data: data ? inputCodec.encode(data) : Buffer.allocUnsafe(0),
            metadata: encodedMetadata,
          },
          s
        ),
      outputCodec
    );
  };
}

export function requestStream<TData, RData>(
  data: TData,
  inputCodec: Codec<TData>,
  outputCodec: Codec<RData>,
  prefetch: number = 256,
  scheduler: SchedulerLike = asyncScheduler
): (
  rsocket: RSocket,
  metadata?: Map<string | number | WellKnownMimeType, Buffer>
) => Observable<RData> {
  return (
    rsocket: RSocket,
    metadata?: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const encodedMetadata = metadata ? encodeCompositeMetadata(metadata) : null;
    return new RSocketPublisherToPrefetchingObservable(
      (s, n) =>
        rsocket.requestStream(
          {
            data: data ? inputCodec.encode(data) : Buffer.allocUnsafe(0),
            metadata: encodedMetadata,
          },
          n,
          s
        ),
      prefetch,
      outputCodec,
      scheduler
    );
  };
}

export function requestChannel<TData, RData>(
  datas: Observable<TData>,
  inputCodec: Codec<TData>,
  outputCodec: Codec<RData>,
  prefetch: number = 256,
  scheduler: SchedulerLike = asyncScheduler
): (
  rsocket: RSocket,
  metadata?: Map<string | number | WellKnownMimeType, Buffer>
) => Observable<RData> {
  let once = false;
  const [firstValueObservable, restValuesObservable] = partition(
    datas.pipe(
      share({
        connector: () => new Subject(),
        resetOnRefCountZero: true,
      })
    ),
    (_value) => {
      const previous = once;
      if (!previous) {
        once = true;
      }

      return !previous;
    }
  );

  return (
    rsocket: RSocket,
    metadata?: Map<string | number | WellKnownMimeType, Buffer>
  ) => {
    const encodedMetadata = metadata ? encodeCompositeMetadata(metadata) : null;
    return firstValueObservable.pipe(
      take(1),
      concatMap((firstValue) => {
        return new Observer2BufferingSubscriberToPublisher2PrefetchingObservable(
          (
            s: OnTerminalSubscriber &
              OnNextSubscriber &
              OnExtensionSubscriber &
              Requestable &
              Cancellable
          ) => {
            return rsocket.requestChannel(
              {
                data: inputCodec.encode(firstValue),
                metadata: encodedMetadata,
              },
              prefetch,
              false,
              s
            );
          },
          prefetch,
          restValuesObservable,
          inputCodec,
          outputCodec,
          scheduler
        ) as Observable<RData>;
      })
    );
  };
}
