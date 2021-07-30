import {
  CancelFrame,
  Cancellable,
  ErrorFrame,
  Flags,
  FrameTypes,
  Outbound,
  Payload,
  PayloadFrame,
  RequestFnfFrame,
  RequestNFrame,
  StreamConfig,
  StreamFrameHandler,
  StreamLifecycleHandler,
  StreamsRegistry,
  UnidirectionalStream,
} from "@rsocket/rsocket-types";
import { fragment, isFragmentable } from "./Fragmenter";
import * as Reassembler from "./Reassembler";

export class RequestFnFRequesterHandler
  implements Cancellable, StreamLifecycleHandler, StreamFrameHandler {
  private done: boolean;
  private outbound: Outbound;
  private fragmentSize: number;

  streamId: number;

  constructor(
    private payload: Payload,
    private receiver: UnidirectionalStream,
    private streamRegistry: StreamsRegistry
  ) {
    streamRegistry.add(this);
  }

  handleReady(streamId: number, { outbound, fragmentSize }: StreamConfig) {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;
    this.outbound = outbound;
    this.fragmentSize = fragmentSize;

    if (isFragmentable(this.payload, fragmentSize, FrameTypes.REQUEST_FNF)) {
      for (const frame of fragment(
        streamId,
        this.payload,
        fragmentSize,
        FrameTypes.REQUEST_FNF
      )) {
        outbound.send(frame);
      }
    } else {
      outbound.send({
        type: FrameTypes.REQUEST_FNF,
        data: this.payload.data,
        metadata: this.payload.metadata,
        flags: this.payload.metadata ? Flags.METADATA : 0,
        streamId,
      });
    }

    this.done = true;

    this.receiver.onComplete();

    return true;
  }

  handleReject(error: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.receiver.onError(error);
  }

  cancel(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.streamRegistry.remove(this);
  }

  handle() {}

  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    if (error) {
      this.receiver.onError(error);
    } else {
      this.receiver.onComplete();
    }
  }
}

export class RequestFnfResponderHandler
  implements
    UnidirectionalStream,
    StreamFrameHandler,
    Reassembler.FragmentsHolder {
  private cancellable?: Cancellable;
  private done: boolean;

  hasFragments: boolean;
  data: Buffer;
  metadata: Buffer;

  constructor(
    readonly streamId: number,
    private registry: StreamsRegistry,
    private handler: (
      payload: Payload,
      senderStream: UnidirectionalStream
    ) => Cancellable,
    frame: RequestFnfFrame
  ) {
    if (Flags.hasFollows(frame.flags)) {
      Reassembler.add(this, frame.data, frame.metadata);
      registry.add(this, streamId);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };
    this.cancellable = handler(payload, this);
  }

  handle(frame: CancelFrame | ErrorFrame | PayloadFrame | RequestNFrame): void {
    if (this.cancellable || this.done) {
      // TODO: log dropped frame
      return;
    }

    if (frame.type == FrameTypes.PAYLOAD) {
      if (Flags.hasFollows(frame.flags)) {
        Reassembler.add(this, frame.data, frame.metadata);
        return;
      }

      this.registry.remove(this);

      const payload = Reassembler.reassemble(this, frame.data, frame.metadata);
      this.cancellable = this.handler(payload, this);
      return;
    }

    this.done = true;

    this.registry.remove(this);

    Reassembler.cancel(this);
    // TODO: throws if strict
  }

  close(error?: Error) {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    this.done = true;

    Reassembler.cancel(this);

    this.cancellable?.cancel();
  }

  onError(error: Error): void {}

  onComplete(): void {}

  onNext(payload: Payload, isCompletion: boolean): void {}

  request(requestN: number): void {}

  cancel(): void {}

  onExtension(
    extendedType: number,
    payload: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void {}
}
/*
export function request(
  payload: Payload,
  responderStream: UnidirectionalStream
): Handler<Cancellable> {
  return {
    create: (r) => {
      const response = new RequestFnFRequesterHandler(
        payload,
        responderStream,
        r
      );

      r.add(response);

      return response;
    },
  };
}

export function response(
  handler: (payload: Payload, responderStream: UnidirectionalStream,) => void
): Handler<void> {
  return {
    create: (r) => new RequestFnfResponderHandler(),
  };
} */
