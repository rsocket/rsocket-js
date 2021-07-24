import {
  CancelFrame,
  Cancellable,
  ErrorCodes,
  ErrorFrame,
  ExtFrame,
  Flags,
  FrameTypes,
  Outbound,
  Payload,
  PayloadFrame,
  RequestNFrame,
  RequestResponseFrame,
  RSocketError,
  StreamConfig,
  StreamFrameHandler,
  StreamLifecycleHandler,
  StreamsRegistry,
  UnidirectionalStream,
} from "@rsocket/rsocket-types";
import { fragment, isFragmentable } from "./Fragmenter";
import * as Reassembler from "./Reassembler";

export class RequestResponseRequesterStream
  implements
    Cancellable,
    StreamFrameHandler,
    StreamLifecycleHandler,
    Reassembler.FragmentsHolder {
  private done: boolean;
  private outbound: Outbound;
  private fragmentSize: number;

  hasFragments: boolean;
  data: Buffer;
  metadata: Buffer;

  streamId: number;

  constructor(
    private payload: Payload,
    private receiver: UnidirectionalStream,
    private streamsRegistry: StreamsRegistry
  ) {
    streamsRegistry.add(this);
  }

  handleReady(
    streamId: number,
    { outbound, fragmentSize }: StreamConfig
  ): boolean {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;
    this.outbound = outbound;
    this.fragmentSize = fragmentSize;

    if (
      isFragmentable(this.payload, fragmentSize, FrameTypes.REQUEST_RESPONSE)
    ) {
      for (const frame of fragment(
        streamId,
        this.payload,
        fragmentSize,
        FrameTypes.REQUEST_RESPONSE
      )) {
        this.outbound.send(frame);
      }
    } else {
      this.outbound.send({
        type: FrameTypes.REQUEST_RESPONSE,
        data: this.payload.data,
        metadata: this.payload.metadata,
        flags: this.payload.metadata ? Flags.METADATA : 0,
        streamId,
      });
    }

    return true;
  }

  handleReject(error: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.receiver.onError(error);
  }

  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void {
    if (this.done) {
      return;
    }

    switch (frame.type) {
      case FrameTypes.PAYLOAD:
        const hasComplete = Flags.hasComplete(frame.flags);
        const hasPayload = Flags.hasNext(frame.flags);

        if (hasComplete || !Flags.hasFollows(frame.flags)) {
          this.done = true;

          this.streamsRegistry.remove(this);

          if (!hasPayload) {
            // TODO: add validation no frame in reassembly
            this.receiver.onComplete();
            return;
          }

          const payload: Payload = this.hasFragments
            ? Reassembler.reassemble(this, frame.data, frame.metadata)
            : {
                data: frame.data,
                metadata: frame.metadata,
              };

          this.receiver.onNext(payload, true);
          return;
        }

        Reassembler.add(this, frame.data, frame.metadata);
        return;

      case FrameTypes.ERROR:
        this.done = true;

        this.streamsRegistry.remove(this);

        Reassembler.cancel(this);

        this.receiver.onError(new RSocketError(frame.code, frame.message));
        return;

      case FrameTypes.EXT:
        this.receiver.onExtension(
          frame.extendedType,
          frame.extendedContent,
          Flags.hasIgnore(frame.flags)
        );
        return;
      default:
      // TODO: throw an exception if strict frame handling mode
    }
  }

  cancel(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.streamsRegistry.remove(this);

    if (!this.streamId) {
      return;
    }

    this.outbound.send({
      type: FrameTypes.CANCEL,
      flags: Flags.NONE,
      streamId: this.streamId,
    });

    Reassembler.cancel(this);
  }

  close(error?: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;

    if (error) {
      this.receiver.onError(error);
    } else {
      this.receiver.onComplete();
    }
  }
}

export class RequestResponseResponderStream
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
    private outbound: Outbound,
    private fragmentSize: number,
    private handler: (
      payload: Payload,
      senderStream: UnidirectionalStream
    ) => Cancellable,
    frame: RequestResponseFrame
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
    if (this.done) {
      return;
    }

    if (frame.type == FrameTypes.PAYLOAD) {
      if (Flags.hasFollows(frame.flags)) {
        Reassembler.add(this, frame.data, frame.metadata);
        return;
      }

      const payload = Reassembler.reassemble(this, frame.data, frame.metadata);
      this.cancellable = this.handler(payload, this);
      return;
    }

    this.done = true;

    this.registry.remove(this);

    Reassembler.cancel(this);

    this.cancellable?.cancel();

    if (frame.type !== FrameTypes.CANCEL && frame.type !== FrameTypes.ERROR) {
      this.outbound.send({
        type: FrameTypes.ERROR,
        flags: Flags.NONE,
        code: ErrorCodes.CANCELED,
        message: `Received unexpected frame [${frame.type}]`,
        streamId: this.streamId,
      });
    }
    // TODO: throws if strict
  }

  onError(error: Error): void {
    if (this.done) {
      console.warn(
        `Trying to error for the second time. ${
          error ? `Droppeing error [${error}].` : ""
        }`
      );
      return;
    }

    this.done = true;

    this.registry.remove(this);

    this.outbound.send({
      type: FrameTypes.ERROR,
      flags: Flags.NONE,
      code:
        error instanceof RSocketError
          ? error.code
          : ErrorCodes.APPLICATION_ERROR,
      message: error.message,
      streamId: this.streamId,
    });
  }

  onNext(payload: Payload, isCompletion: boolean): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.registry.remove(this);

    if (isFragmentable(payload, this.fragmentSize, FrameTypes.PAYLOAD)) {
      for (const frame of fragment(
        this.streamId,
        payload,
        this.fragmentSize,
        FrameTypes.PAYLOAD
      )) {
        this.outbound.send(frame);
      }
    } else {
      this.outbound.send({
        type: FrameTypes.PAYLOAD,
        flags:
          Flags.NEXT | Flags.COMPLETE | (payload.metadata ? Flags.METADATA : 0),
        data: payload.data,
        metadata: payload.metadata,
        streamId: this.streamId,
      });
    }
  }

  onComplete(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.registry.remove(this);

    this.outbound.send({
      type: FrameTypes.PAYLOAD,
      flags: Flags.COMPLETE,
      streamId: this.streamId,
      data: null,
      metadata: null,
    });
  }

  request(requestN: number): void {}

  cancel(): void {}

  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {
    if (this.done) {
      return;
    }

    this.outbound.send({
      type: FrameTypes.EXT,
      streamId: this.streamId,
      flags: canBeIgnored ? Flags.IGNORE : 0,
      extendedType,
      extendedContent: content,
    });
  }

  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Droppeing error [${error}].` : ""
        }`
      );
      return;
    }

    Reassembler.cancel(this);

    this.cancellable?.cancel();
  }
}
