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

import {
  Cancellable,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
} from "@rsocket/core";
import { Observable, partition, interval, concatMap, map, Unsubscribable, Observer } from "rxjs";

interface Codec<D> {
  mimeType: string;

  encode(entity: D): Buffer;
  decode(buffer: Buffer): D;
}

interface Adapter<D, ST, MT> {
  dataType: D;
  singleSubscriber(
    r: ST
  ): OnNextSubscriber & OnTerminalSubscriber & Cancellable;
  manySubscriber(
    r: MT
  ): OnNextSubscriber & OnTerminalSubscriber & Requestable & Cancellable;

  singleProducer(r: RSocket): ST;
  manyProducer(r: RSocket): ST;
}

class StringEncoder implements Codec<string> {
  mimeType: string;
  decode(buffer: Buffer): string {
    throw new Error("Method not implemented.");
  }
  encode(p: String): Buffer {
    throw new Error("Method not implemented.");
  }
}

class IterableCodec implements Adapter<number, AsyncIterator<number>> {
  _dataType: number;
  transform(r: RSocket): AsyncIterator<number> {
    throw new Error("Method not implemented.");
  }
}

class RSocketRequester {
  constructor(rsocket: RSocket);

  request<T, D>(config: {}): T {
    return undefined;
  }
}

interface Config<D, T> {
  encoder: Codec<D>;
  codec: Adapter<D, T>;
}

request(new StringEncoder(), new IterableCodec());

function test123() {
  const r = new RSocketRequester();

  const i = r.request(new StringEncoder(), new IterableCodec());

  i;
}

let rsocket: RSocket = undefined;

const [first, tail] = partition(
  interval(100).pipe(
    map(
      (i) =>
        ({
          data: Buffer.from(i + ""),
        } as Payload)
    )
  ),
  (_, i) => i == 0
);

first.pipe(
  concatMap(
    (payload) =>
      new Observable<Payload>((observer) => {
        observer["onNext"] = function (p: Payload, isDone: boolean) {
          this.next(p);
          if (isDone) {
            this.complete();
            return;
          }
        };
        observer["onError"] = observer.error;
        observer["onComplete"] = observer.complete;
        observer["cancel"] = req.unsubscribe;
        observer["request"] = function (n: number) {
          const isInitiated = this.isInitiated;
          if (!isInitiated) {
            this.isInitiated = true;
            tail.subscribe(requester as any);
          }
        };
        const requester = rsocket.requestChannel(
          payload,
          256,
          false,
          observer as any
        );

        requester["values"] = [];
        requester["unsubscribe"] = requester.cancel;
        requester["drain"] = function() {
          requester
        };
        requester["next"] = function(payload: Payload) {
          this.values.push(payload);
          this.drain();
        } 
        requester["error"] = requester.onError;
        requester["complete"] = requester.onComplete;

        return requester as any as Unsubscribable;
      })
  )
);

new Observable((observer) => {}).pipe();



abstract class BufferingObserverToProducer extends Array implements Observer<Payload>, Unsubscribable, OnNextSubscriber, OnTerminalSubscriber, Requestable, Cancellable {

  private requested: number = 0;
  private wip: number = 0;
  private done: boolean;
  private cancelled: boolean;

  next (value: Payload) {
    this.push(value);

  }
  error: (err: any) => void;
  complete: () => void;

  unsubscribe(): void {
      this.cancel()
  }

  addRequest(n: number) {
    const requested = this.requested;
    this.requested = requested + n;

    if (this.wip == 0 && requested > 0) {
      return;
    }

    this.drain();
  }

  abstract onNext(payload: Payload, isComplete: boolean): void;
  abstract onError(error: Error): void;
  abstract onComplete(): void;
  abstract request(requestN: number): void;
  abstract cancel(): void;


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
      while (delivered <= requested) {
        const next = this.shift()

        if (next == undefined) {
          if (this.done) {
            this.onComplete();
            return
          }

          if (this.cancelled) {
            return;
          }
        }

        const isTerminated = this.length == 0 && this.done;
        this.onNext(next, isTerminated);

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