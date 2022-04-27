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
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "rsocket-core";
import { Codec } from "rsocket-messaging";
import { asyncScheduler, Observable, SchedulerLike } from "rxjs";
import ObserverToBufferingRSocketSubscriber from "./ObserverToBufferingRSocketSubscriber";
import ObserverToRSocketSubscriber from "./ObserverToRSocketSubscriber";
import RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber from "./RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber";

export function fireAndForget<IN>(
  handler: (data: IN) => Observable<void>,
  codec: Codec<IN>
): ((p: Payload, s: OnTerminalSubscriber) => Cancellable) & {
  requestType: FrameTypes.REQUEST_FNF;
} {
  return Object.assign<
    (p: Payload, s: OnTerminalSubscriber) => Cancellable,
    {
      requestType: FrameTypes.REQUEST_FNF;
    }
  >(
    (p: Payload, s: OnTerminalSubscriber) => {
      const cancellableSubscriber = new ObserverToRSocketSubscriber<void>(
        s,
        undefined
      );

      handler(codec.decode(p.data)).subscribe(cancellableSubscriber);

      return cancellableSubscriber;
    },
    { requestType: FrameTypes.REQUEST_FNF }
  );
}

export function requestResponse<IN, OUT>(
  handler: (data: IN) => Observable<OUT>,
  codecs: {
    inputCodec: IN extends void | null | undefined ? undefined : Codec<IN>;
    outputCodec: OUT extends void | null | undefined ? undefined : Codec<OUT>;
  }
): ((
  p: Payload,
  s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
) => Cancellable & OnExtensionSubscriber) & {
  requestType: FrameTypes.REQUEST_RESPONSE;
} {
  return Object.assign<
    (
      p: Payload,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber,
    {
      requestType: FrameTypes.REQUEST_RESPONSE;
    }
  >(
    (
      p: Payload,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => {
      const cancellableSubscriber = new ObserverToRSocketSubscriber<OUT>(
        s,
        codecs.outputCodec
      );

      handler(codecs.inputCodec.decode(p.data)).subscribe(
        cancellableSubscriber
      );

      return cancellableSubscriber;
    },
    {
      requestType: FrameTypes.REQUEST_RESPONSE,
    }
  );
}

export function requestStream<IN, OUT>(
  handler: (data: IN) => Observable<OUT>,
  codecs: {
    inputCodec: Codec<IN>;
    outputCodec: Codec<OUT>;
  }
): ((
  p: Payload,
  r: number,
  s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
) => Cancellable & OnExtensionSubscriber & Requestable) & {
  requestType: FrameTypes.REQUEST_STREAM;
} {
  return Object.assign<
    (
      p: Payload,
      r: number,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber & Requestable,
    {
      requestType: FrameTypes.REQUEST_STREAM;
    }
  >(
    (
      p: Payload,
      r: number,
      s: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
    ) => {
      const cancellableSubscriber =
        new ObserverToBufferingRSocketSubscriber<OUT>(r, s, codecs.outputCodec);

      handler(codecs.inputCodec.decode(p.data)).subscribe(
        cancellableSubscriber
      );

      return cancellableSubscriber;
    },
    { requestType: FrameTypes.REQUEST_STREAM }
  );
}

export function requestChannel<IN, OUT>(
  handler: (dataStream: Observable<IN>) => Observable<OUT>,
  codecs: {
    inputCodec: Codec<IN>;
    outputCodec: Codec<OUT>;
  },
  prefetch: number = 256,
  scheduler: SchedulerLike = asyncScheduler
): ((
  payload: Payload,
  initialRequestN: number,
  isCompleted: boolean,
  s: OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable
) => OnTerminalSubscriber &
  OnNextSubscriber &
  OnExtensionSubscriber &
  Requestable &
  Cancellable) & {
  requestType: FrameTypes.REQUEST_CHANNEL;
} {
  return Object.assign<
    (
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      s: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable,
    {
      requestType: FrameTypes.REQUEST_CHANNEL;
    }
  >(
    (
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      s: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => {
      const cancellableSubscriber =
        new RSocketPublisher2PrefetchingObservableToObserver2BufferingRSocketSubscriber<
          IN,
          OUT
        >(
          payload,
          isCompleted,
          s,
          initialRequestN,
          prefetch,
          codecs.inputCodec,
          codecs.outputCodec,
          scheduler
        );

      handler(cancellableSubscriber).subscribe(cancellableSubscriber);

      return cancellableSubscriber;
    },
    {
      requestType: FrameTypes.REQUEST_CHANNEL,
    }
  );
}
