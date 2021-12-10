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
  decodeRoutes,
  encodeCompositeMetadata,
  encodeRoutes,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";
import { ErrorCodes, FrameTypes, OnExtensionSubscriber, OnNextSubscriber, Requestable, RSocket, RSocketError } from "@rsocket/core";
import {
  Cancellable,
  OnTerminalSubscriber,
  Payload,
} from "packages/rsocket-core/dist";

export interface Codec<D> {
  mimeType: string;

  encode(entity: D): Buffer;
  decode(buffer: Buffer): D;
}

class StringEncoder implements Codec<string> {
  mimeType: string;
  decode(buffer: Buffer): string {
    return buffer.toString();
  }
  encode(entity: string): Buffer {
    return Buffer.from(entity);
  }
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

export interface Mono<DataType> {
  _type?: DataType;
}
export interface Flux<DataType> {
  _type?: DataType | undefined;
}

export interface RequestSpec<
  InputDataType,
  FluxInput extends Flux<InputDataType>,
  OutputDataType,
  VoidOutput extends Mono<void>,
  MonoOutput extends Mono<OutputDataType>,
  FluxOutput extends Flux<OutputDataType>
> {
  metadata(key: string | WellKnownMimeType | number, content: Buffer): this;

  fireAndForget(): VoidOutput;
  fireAndForget(data: InputDataType): VoidOutput;

  requestResponse(): MonoOutput;
  requestResponse(data: InputDataType): MonoOutput;

  stream(): FluxOutput;
  stream(data: InputDataType): FluxOutput;

  channel(datas: FluxInput): FluxOutput;
}

export interface RequestFactory<
  InputDataType,
  FluxInput extends Flux<InputDataType>,
  OutputDataType,
  VoidOutput extends Mono<void>,
  MonoOutput extends Mono<OutputDataType>,
  FluxOutput extends Flux<OutputDataType>
> {
  fireAndForget(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>
  ) => VoidOutput;

  requestResponse(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>
  ) => MonoOutput;

  stream(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: InputDataType,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>,
    initialRequestN: number
  ) => FluxOutput;

  channel(): (
    rsocket: RSocket,
    metadata: Buffer,
    input: FluxInput,
    inputCodec: Codec<InputDataType>,
    outputCodec: Codec<OutputDataType>,
    initialRequestN: number
  ) => FluxOutput;
}

class DefaultRequestSpec<
  InputDataType,
  FluxInput extends Flux<InputDataType>,
  OutputDataType,
  VoidOutput extends Mono<void>,
  MonoOutput extends Mono<OutputDataType>,
  FluxOutput extends Flux<OutputDataType>
> implements
    RequestSpec<
      InputDataType,
      FluxInput,
      OutputDataType,
      VoidOutput,
      MonoOutput,
      FluxOutput
    >
{
  private readonly metadatas: Map<string | number | WellKnownMimeType, Buffer> =
    new Map();

  constructor(
    private readonly route: string,
    private readonly requestFactory: RequestFactory<
      InputDataType,
      FluxInput,
      OutputDataType,
      VoidOutput,
      MonoOutput,
      FluxOutput
    >,
    private readonly inputCodec: Codec<InputDataType>,
    private readonly outputCodec: Codec<OutputDataType>,
    private readonly rsocket: RSocket
  ) {}

  fireAndForget(): VoidOutput;
  fireAndForget(data: InputDataType): VoidOutput;
  fireAndForget(data?: InputDataType): VoidOutput {
    this.metadatas.set(
      WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
      encodeRoutes(this.route)
    );
    return this.requestFactory.fireAndForget()(
      this.rsocket,
      encodeCompositeMetadata(this.metadatas),
      data,
      this.inputCodec
    );
  }
  requestResponse(): MonoOutput;
  requestResponse(data: InputDataType): MonoOutput;
  requestResponse(data?: InputDataType): MonoOutput {
    this.metadatas.set(
      WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
      encodeRoutes(this.route)
    );
    return this.requestFactory.requestResponse()(
      this.rsocket,
      encodeCompositeMetadata(this.metadatas),
      data,
      this.inputCodec,
      this.outputCodec
    );
  }
  stream(): FluxOutput;
  stream(data: InputDataType): FluxOutput;
  stream(data?: InputDataType): FluxOutput {
    this.metadatas.set(
      WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
      encodeRoutes(this.route)
    );
    return this.requestFactory.stream()(
      this.rsocket,
      encodeCompositeMetadata(this.metadatas),
      data,
      this.inputCodec,
      this.outputCodec,
      256
    );
  }
  channel(datas: FluxInput): FluxOutput {
    this.metadatas.set(
      WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
      encodeRoutes(this.route)
    );
    return this.requestFactory.channel()(
      this.rsocket,
      encodeCompositeMetadata(this.metadatas),
      datas,
      this.inputCodec,
      this.outputCodec,
      256
    );
  }

  metadata(key: string | number | WellKnownMimeType, content: Buffer): this {
    this.metadatas.set(key, content);
    return this;
  }
}

export class RSocketRequester<
  InputDataType,
  FluxInput extends Flux<InputDataType>,
  OutputDataType,
  VoidOutput extends Mono<void>,
  MonoOutput extends Mono<OutputDataType>,
  FluxOutput extends Flux<OutputDataType>
> {
  constructor(
    private readonly rsocket: RSocket,
    private readonly defaultCodecs: {
      inputCodec: Codec<InputDataType>;
      outputCodec: Codec<OutputDataType>;
    },
    private readonly requestFactory: RequestFactory<
      InputDataType,
      FluxInput,
      OutputDataType,
      VoidOutput,
      MonoOutput,
      FluxOutput
    >
  ) {}

  route(
    route: string
  ): RequestSpec<
    InputDataType,
    FluxInput,
    OutputDataType,
    VoidOutput,
    MonoOutput,
    FluxOutput
  > {
    return new DefaultRequestSpec(
      route,
      this.requestFactory,
      this.defaultCodecs.inputCodec,
      this.defaultCodecs.outputCodec,
      this.rsocket
    );
  }
}

export class DefaultRouter implements RSocket, Cancellable , Requestable , OnNextSubscriber , OnExtensionSubscriber , OnTerminalSubscriber {

  private readonly routes: {
    [routeKey: string]: {
      [FrameTypes.METADATA_PUSH]: (
        payload: Payload,
        responderStream: OnTerminalSubscriber
      ) => void;
      [FrameTypes.REQUEST_FNF]: (
        payload: Payload,
        responderStream: OnTerminalSubscriber
      ) => Cancellable;
      [FrameTypes.REQUEST_RESPONSE]: (
        payload: Payload,
        responderStream: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      ) => Cancellable & OnExtensionSubscriber;
      [FrameTypes.REQUEST_STREAM]: (
        payload: Payload,
        initialReuqestN: number,
        responderStream: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      ) => Cancellable & OnExtensionSubscriber & Requestable;
      [FrameTypes.REQUEST_CHANNEL]: (
        payload: Payload,
        initialReuqestN: number,
        responderStream: Cancellable & Requestable & OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
      ) => Cancellable & Requestable & OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber;
    };
  };

  route(
    path: string,
    handler: ((
      payload: Payload,
      responderStream: OnTerminalSubscriber
    ) => Cancellable) & { requestType: FrameTypes.REQUEST_FNF }
  ): this {
    this.routes[path] = Object.assign({}, this.routes[path],  {[handler.requestType] : handler});
    return this;
  }

  build() : RSocket {
    return this;
  }

  fireAndForget(payload: Payload, responderStream: OnTerminalSubscriber): Cancellable {
    if (payload.metadata) {
      for (let entry of decodeCompositeMetadata(payload.metadata)) {
        if (entry.mimeType === WellKnownMimeType.MESSAGE_RSOCKET_ROUTING.string) {
          for (let route of decodeRoutes(entry.content)) {
            const handlers = this.routes[route];

            if (handlers) {
              const handler = handlers[FrameTypes.REQUEST_FNF];

              if (handler) {
                return handler(payload, responderStream);
              }
            }
          }
        } 
      }
    }

    responderStream.onError(new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found"));

    return this;
  }

  requestResponse(payload: Payload, responderStream: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber): Cancellable & OnExtensionSubscriber {
    if (payload.metadata) {
      for (let entry of decodeCompositeMetadata(payload.metadata)) {
        if (entry.mimeType === WellKnownMimeType.MESSAGE_RSOCKET_ROUTING.string) {
          for (let route of decodeRoutes(entry.content)) {
            const handlers = this.routes[route];

            if (handlers) {
              const handler = handlers[FrameTypes.REQUEST_RESPONSE];

              if (handler) {
                return handler(payload, responderStream);
              }
            }
          }
        } 
      }
    }

    responderStream.onError(new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found"));

    return this;
  }

  requestStream(payload: Payload, initialRequestN: number, responderStream: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber): Requestable & Cancellable & OnExtensionSubscriber {
    if (payload.metadata) {
      for (let entry of decodeCompositeMetadata(payload.metadata)) {
        if (entry.mimeType === WellKnownMimeType.MESSAGE_RSOCKET_ROUTING.string) {
          for (let route of decodeRoutes(entry.content)) {
            const handlers = this.routes[route];

            if (handlers) {
              const handler = handlers[FrameTypes.REQUEST_STREAM];

              if (handler) {
                return handler(payload, initialRequestN, responderStream);
              }
            }
          }
        } 
      }
    }

    responderStream.onError(new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found"));

    return this;
  }
  requestChannel(payload: Payload, initialRequestN: number, isCompleted: boolean, responderStream: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber & Requestable & Cancellable): OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber & Requestable & Cancellable {
    if (payload.metadata) {
      for (let entry of decodeCompositeMetadata(payload.metadata)) {
        if (entry.mimeType === WellKnownMimeType.MESSAGE_RSOCKET_ROUTING.string) {
          for (let route of decodeRoutes(entry.content)) {
            const handlers = this.routes[route];

            if (handlers) {
              const handler = handlers[FrameTypes.REQUEST_CHANNEL];

              if (handler) {
                return handler(payload, initialRequestN, responderStream);
              }
            }
          }
        } 
      }
    }

    responderStream.onError(new RSocketError(ErrorCodes.APPLICATION_ERROR, "Route not found"));

    return this;
  }

  metadataPush(metadata: Buffer, responderStream: OnTerminalSubscriber): void {
    throw new Error("Method not implemented.");
  }
  close(error?: Error): void {
    throw new Error("Method not implemented.");
  }
  onClose(callback: (error?: Error) => void): void {
    throw new Error("Method not implemented.");
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
  onExtension(extendedType: number, content: Buffer, canBeIgnored: boolean): void {
    // noops
  }
  onError(error: Error): void {
    // noops
  }
  onComplete(): void {
    // noops
  }
}

router.route(
  "test.path",
  codecs,
  fireAndForgetRxHandler((request) => Observable.just(request))
);

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
