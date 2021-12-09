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
 * See the License for thяe specific language governing permissions and
 * limitations under the License.
 *
 */
"use strict";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
} from "@rsocket/core";
import { Codec } from "@rsocket/messaging";
import { Observer, Subscription } from "rxjs";

export default class ObserverToRSocketSubscriber<T>
  extends Subscription
  implements Observer<T>, Cancellable, OnExtensionSubscriber
{
  constructor(
    private readonly subscriber: T extends void | null | undefined
      ? OnTerminalSubscriber
      : OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber,
    private readonly codec: T extends void | null | undefined
      ? undefined
      : Codec<T>
  ) {
    super();
  }
  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {}

  cancel(): void {
    this.unsubscribe();
  }

  next(value?: T): void {
    if (isVoid(value)) {
      return;
    }

    this.unsubscribe();

    (this.subscriber as OnNextSubscriber).onNext(
      {
        data: this.codec?.encode(value),
      },
      true
    );
  }

  error(err?: any): void {
    this.subscriber.onError(err);
  }

  complete(): void {
    this.subscriber.onComplete();
  }
}

function isVoid(value: any): value is void {
  return value == undefined;
}
