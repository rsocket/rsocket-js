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
  decodeCompositeMetadata,
  decodeRoutes, encodeRoutes,
  WellKnownMimeType
} from "@rsocket/composite-metadata";
import {
  Cancellable,
  ErrorCodes,
  FrameTypes,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
  RSocketError
} from "@rsocket/core";

export interface Codec<D> {
  mimeType: string;

  encode(entity: D): Buffer;
  decode(buffer: Buffer): D;
}

// class AsyncFnfCallAdapter<InputDataType>
//   implements
//     CallAdapter<
//       InputDataType,
//       void,
//       InputDataType,
//       Promise<void> & Cancellable
//     >
// {
//   _inputDataType: InputDataType;
//   _outputDataType: void;

//   createCall(
//     rsocket: RSocket,
//     metadata: Buffer,
//     input: InputDataType,
//     inputCodec: Codec<InputDataType>,
//     _outputCodec: Codec<void> = undefined
//   ): Promise<void> & Cancellable {
//     return new PromiseSubscriber((s) =>
//       rsocket.fireAndForget(
//         {
//           data: inputCodec.encode(input),
//           metadata,
//         },
//         s
//       )
//     );
//   }
// }

// class PromiseSubscriber<T>
//   extends Promise<T>
//   implements OnTerminalSubscriber, OnNextSubscriber, Cancellable
// {
//   private resolve: (value: T | PromiseLike<T>) => void;
//   private reject: (reason?: any) => void;
//   private cancellable: Cancellable;

//   constructor(
//     call: (subscriber: OnNextSubscriber & OnTerminalSubscriber) => Cancellable,
//     private readonly responseCodec?: Codec<T>
//   ) {
//     super((resolve, reject) => {
//       this.resolve = resolve;
//       this.reject = reject;

//       call(this);
//     });
//   }

//   cancel(): void {
//     this.cancellable.cancel();
//   }

//   onNext(payload: Payload, _isComplete: boolean): void {
//     this.resolve(this.responseCodec.decode(payload.data));
//   }

//   onError(error: Error): void {
//     this.reject(error);
//   }

//   onComplete(): void {
//     this.resolve(undefined);
//   }
// }

export interface RequestSpec {
  metadata(key: string | WellKnownMimeType | number, content: Buffer): this;

  request<TResponseType>(
    exchangeFunction: (
      rsocket: RSocket,
      metadata: Map<string | number | WellKnownMimeType, Buffer>
    ) => TResponseType
  ): TResponseType;
}

class DefaultRequestSpec implements RequestSpec {
  private readonly metadatas: Map<string | number | WellKnownMimeType, Buffer>;

  constructor(route: string, private readonly rsocket: RSocket) {
    this.metadatas = new Map([
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, encodeRoutes(route)],
    ]);
  }

  metadata(key: string | number | WellKnownMimeType, content: Buffer): this {
    this.metadatas.set(key, content);
    return this;
  }

  request<RPublisher>(
    exchangeFunction: (
      rsocket: RSocket,
      metadatas: Map<string | number | WellKnownMimeType, Buffer>
    ) => RPublisher
  ): RPublisher {
    return exchangeFunction(this.rsocket, this.metadatas);
  }
}

export interface RSocketRequester {
  route(route: string): RequestSpec;
}

export namespace RSocketRequester {
  export function wrap(rsocket: RSocket): RSocketRequester {
    return new WrappingRSocketRequester(rsocket);
  }
}

class WrappingRSocketRequester implements RSocketRequester {
  constructor(private readonly rsocket: RSocket) {}

  route(route: string): RequestSpec {
    return new DefaultRequestSpec(route, this.rsocket);
  }
}

interface TypesRegistry {
  [FrameTypes.METADATA_PUSH]: (
    metadata: Buffer,
    responderStream: OnTerminalSubscriber
  ) => void;
  [FrameTypes.REQUEST_FNF]: (
    payload: Payload,
    responderStream: OnTerminalSubscriber
  ) => Cancellable;
  [FrameTypes.REQUEST_RESPONSE]: (
    payload: Payload,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ) => Cancellable & OnExtensionSubscriber;
  [FrameTypes.REQUEST_STREAM]: (
    payload: Payload,
    initialReuqestN: number,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ) => Cancellable & OnExtensionSubscriber & Requestable;
  [FrameTypes.REQUEST_CHANNEL]: (
    payload: Payload,
    initialReuqestN: number,
    isCompleted: boolean,
    responderStream: Cancellable &
      Requestable &
      OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ) => Cancellable &
    Requestable &
    OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber;
}

interface RoutesRegistry {
  [routeKey: string]: TypesRegistry;
}

export interface RSocketResponder {
  route(
    path: string,
    handler: ((
      payload: Payload,
      signalsHandler: OnTerminalSubscriber
    ) => Cancellable) & { requestType: FrameTypes.REQUEST_FNF }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      signalsHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber) & {
      requestType: FrameTypes.REQUEST_RESPONSE;
    }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      initialRequestN: number,
      signalsHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber
    ) => Cancellable & Requestable & OnExtensionSubscriber) & {
      requestType: FrameTypes.REQUEST_STREAM;
    }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      responderStream: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => Cancellable &
      Requestable &
      OnExtensionSubscriber &
      OnTerminalSubscriber &
      OnNextSubscriber) & {
      requestType: FrameTypes.REQUEST_CHANNEL;
    }
  ): this;

  build(): RSocket;
}

export namespace RSocketResponder {
  export function builder(): RSocketResponder {
    return new DefaultRSocketResponder();
  }
}

class DefaultRSocketResponder
  implements
    RSocketResponder,
    RSocket,
    Cancellable,
    Requestable,
    OnNextSubscriber,
    OnExtensionSubscriber,
    OnTerminalSubscriber
{
  private readonly routes: RoutesRegistry = {};

  route(
    path: string,
    handler: ((
      payload: Payload,
      signalsHandler: OnTerminalSubscriber
    ) => Cancellable) & { requestType: FrameTypes.REQUEST_FNF }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      signalsHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber
    ) => Cancellable & OnExtensionSubscriber) & {
      requestType: FrameTypes.REQUEST_RESPONSE;
    }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      initialRequestN: number,
      signalsHandler: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber
    ) => Cancellable & Requestable & OnExtensionSubscriber) & {
      requestType: FrameTypes.REQUEST_STREAM;
    }
  ): this;
  route(
    path: string,
    handler: ((
      payload: Payload,
      initialRequestN: number,
      isCompleted: boolean,
      responderStream: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber &
        Requestable &
        Cancellable
    ) => Cancellable &
      Requestable &
      OnExtensionSubscriber &
      OnTerminalSubscriber &
      OnNextSubscriber) & {
      requestType: FrameTypes.REQUEST_CHANNEL;
    }
  ): this;
  route(
    path: string,
    handler: ((...args: any) => Cancellable) & {
      requestType:
        | FrameTypes.REQUEST_FNF
        | FrameTypes.REQUEST_RESPONSE
        | FrameTypes.REQUEST_STREAM
        | FrameTypes.REQUEST_CHANNEL;
    }
  ): this {
    this.routes[path] = Object.assign({}, this.routes[path], {
      [handler.requestType]: handler,
    });
    return this;
  }

  build(): RSocket {
    return this;
  }

  fireAndForget(
    payload: Payload,
    responderStream: OnTerminalSubscriber
  ): Cancellable {
    const handlers = this.findTypesRegistry(payload.metadata);

    if (handlers) {
      const handler = handlers[FrameTypes.REQUEST_FNF];

      if (handler) {
        return handler(payload, responderStream);
      }
    }

    responderStream.onError(
      new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found")
    );

    return this;
  }

  requestResponse(
    payload: Payload,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Cancellable & OnExtensionSubscriber {
    const handlers = this.findTypesRegistry(payload.metadata);

    if (handlers) {
      const handler = handlers[FrameTypes.REQUEST_RESPONSE];

      if (handler) {
        return handler(payload, responderStream);
      }
    }

    responderStream.onError(
      new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found")
    );

    return this;
  }

  requestStream(
    payload: Payload,
    initialRequestN: number,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Requestable & Cancellable & OnExtensionSubscriber {
    const handlers = this.findTypesRegistry(payload.metadata);

    if (handlers) {
      const handler = handlers[FrameTypes.REQUEST_STREAM];

      if (handler) {
        return handler(payload, initialRequestN, responderStream);
      }
    }

    responderStream.onError(
      new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found")
    );

    return this;
  }

  requestChannel(
    payload: Payload,
    initialRequestN: number,
    isCompleted: boolean,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable
  ): OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable {
    const handlers = this.findTypesRegistry(payload.metadata);

    if (handlers) {
      const handler = handlers[FrameTypes.REQUEST_CHANNEL];

      if (handler) {
        return handler(payload, initialRequestN, isCompleted, responderStream);
      }
    }

    responderStream.onError(
      new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found")
    );

    return this;
  }

  metadataPush(metadata: Buffer, responderStream: OnTerminalSubscriber): void {
    const handlers = this.findTypesRegistry(metadata);

    if (handlers) {
      const handler = handlers[FrameTypes.METADATA_PUSH];

      if (handler) {
        return handler(metadata, responderStream);
      }
    }
  }

  close(error?: Error): void {}

  onClose(callback: (error?: Error) => void): void {}

  findTypesRegistry(metadata: Buffer | undefined): TypesRegistry {
    if (metadata && metadata.length) {
      for (let entry of decodeCompositeMetadata(metadata)) {
        if (
          entry.mimeType === WellKnownMimeType.MESSAGE_RSOCKET_ROUTING.string
        ) {
          for (let route of decodeRoutes(entry.content)) {
            const handlers = this.routes[route];

            if (handlers) {
              return handlers;
            }
          }
        }
      }
    }
  }

  cancel(): void {
    // noops
  }
  request(requestN: number): void {
    // noops
  }
  onNext(payload: Payload, isComplete: boolean): void {
    // noops
  }
  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {
    // noops
  }
  onError(error: Error): void {
    // noops
  }
  onComplete(): void {
    // noops
  }
}

// router.route(
//   "test.path",
//   codecs,
//   fireAndForgetRxHandler((request) => Observable.just(request))
// );

// async function test123() {
//   const r = new RSocketRequester(null);

//   r.request("hello.world", "hello", {
//     inputCodec: StringEncoder,
//     callFactory: new RxFnfCallAdapter(),
//   })

//   r.request("hello.world", "hello", {
//     inputCodec: new StringEncoder(),
//     callFactory: RxCallFactory.fnf,
//   })

// }

// let rsocket: RSocket = undefined;

// const [first, tail] = partition(
//   interval(100).pipe(
//     map(
//       (i) =>
//         ({
//           data: Buffer.from(i + ""),
//         } as Payload)
//     )
//   ),
//   (_, i) => i == 0
// );

// first.pipe(
//   concatMap(
//     (payload) =>
//       new Observable<Payload>((observer) => {
//         observer["onNext"] = function (p: Payload, isDone: boolean) {
//           this.next(p);
//           if (isDone) {
//             this.complete();
//             return;
//           }
//         };
//         observer["onError"] = observer.error;
//         observer["onComplete"] = observer.complete;
//         observer["cancel"] = req.unsubscribe;
//         observer["request"] = function (n: number) {
//           const isInitiated = this.isInitiated;
//           if (!isInitiated) {
//             this.isInitiated = true;
//             tail.subscribe(requester as any);
//           }
//         };
//         const requester = rsocket.requestChannel(
//           payload,
//           256,
//           false,
//           observer as any
//         );

//         return mix(requester, BufferingObserverToProducer);
//       })
//   )
// );

// new Observable((observer) => {}).pipe();

// interface ObservableRequesFnfRequesterStream
//   extends RequestFnFRequesterStream,
//     Observable<void>,
//     Unsubscribable,
//     OnTerminalSubscriber {}
// class ObservableRequesFnfRequesterStream
//   extends RequestFnFRequesterStream
//   implements Unsubscribable, OnTerminalSubscriber
// {
//   private sink: Subscriber<void>;

//   constructor(
//     payload: Payload,
//     fragmentSize: number,
//     leaseManager?: LeaseManager
//   ) {
//     super(payload, (() => this)(), fragmentSize, leaseManager);
//   }

//   protected _subscribe(sink: Subscriber<void>): TeardownLogic {
//     if (this.streamId) {
//       throw new Error("Multiple subscription for same request");
//     }

//     this.sink = sink;

//     return this;
//   }

//   onError(error: Error): void {
//     this.sink.error(error);
//   }

//   onComplete(): void {
//     this.sink.complete();
//   }

//   unsubscribe(): void {
//     this.cancel();
//   }
// }
// applyMixins(ObservableRequesFnfRequesterStream, [Observable]);

// interface ObservableRequesResponseRequesterStream
//   extends RequestResponseRequesterStream,
//     Observable<Payload>,
//     Unsubscribable,
//     OnTerminalSubscriber,
//     OnNextSubscriber {}
// class ObservableRequesResponseRequesterStream
//   extends RequestResponseRequesterStream
//   implements Unsubscribable, OnTerminalSubscriber, OnNextSubscriber
// {
//   private sink: Subscriber<Payload>;

//   constructor(
//     payload: Payload,
//     fragmentSize: number,
//     leaseManager?: LeaseManager
//   ) {
//     super(payload, (() => this)(), fragmentSize, leaseManager);
//   }

//   protected _subscribe(sink: Subscriber<Payload>): TeardownLogic {
//     if (this.streamId) {
//       throw new Error("Multiple subscription for same request");
//     }

//     this.sink = sink;

//     return this;
//   }

//   onError(error: Error): void {
//     this.sink.error(error);
//   }

//   onComplete(): void {
//     this.sink.complete();
//   }

//   onNext(payload: Payload, isComplete: boolean): void {
//     this.sink.next(payload);
//     if (isComplete) {
//       this.sink.complete();
//     }
//   }

//   unsubscribe(): void {
//     this.cancel();
//   }
// }

// applyMixins(ObservableRequesResponseRequesterStream, [Observable]);

// interface ObservableRequesStreamRequesterStream
//   extends RequestStreamRequesterStream,
//     Observable<Payload>,
//     Unsubscribable,
//     OnTerminalSubscriber,
//     OnNextSubscriber {}
// class ObservableRequesStreamRequesterStream
//   extends RequestStreamRequesterStream
//   implements Unsubscribable, OnTerminalSubscriber, OnNextSubscriber
// {
//   private readonly limit: number;

//   private sink: Subscriber<Payload>;
//   private received: number;

//   constructor(
//     payload: Payload,
//     private readonly prefetch: number,
//     fragmentSize: number,
//     leaseManager?: LeaseManager,
//     private readonly scheduler: SchedulerLike = asyncScheduler
//   ) {
//     super(payload, (() => this)(), fragmentSize, prefetch, leaseManager);
//     this.limit = prefetch >= 0x7fffff ? Infinity : prefetch - (prefetch >> 2);
//   }

//   protected _subscribe(sink: Subscriber<Payload>): TeardownLogic {
//     if (this.streamId) {
//       throw new Error("Multiple subscription for same request");
//     }

//     this.sink = sink;

//     return this;
//   }

//   onError(error: Error): void {
//     this.sink.error(error);
//   }

//   onComplete(): void {
//     this.sink.complete();
//   }

//   onNext(payload: Payload, isComplete: boolean): void {
//     this.sink.next(payload);
//     if (isComplete) {
//       this.sink.complete();
//       return;
//     }

//     this.received++;
//     if (this.received == this.limit) {
//       this.received = 0;
//       this.scheduler.schedule(() => this.request(this.limit));
//     }
//   }

//   unsubscribe(): void {
//     this.cancel();
//   }
// }

// applyMixins(ObservableRequesResponseRequesterStream, [Observable]);

// // This can live anywhere in your codebase:
// function applyMixins(derivedCtor: any, constructors: any[]) {
//   constructors.forEach((baseCtor) => {
//     Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
//       Object.defineProperty(
//         derivedCtor.prototype,
//         name,
//         Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
//           Object.create(null)
//       );
//     });
//   });
// }
