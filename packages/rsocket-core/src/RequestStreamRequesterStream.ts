import {
  CancelFrame,
  Cancellable,
  ErrorFrame,
  ExtFrame,
  Flags,
  FrameTypes,
  Outbound,
  Payload,
  PayloadFrame,
  RequestNFrame,
  RSocketError,
  StreamConfig,
  StreamFrameHandler,
  StreamLifecycleHandler,
  StreamsRegistry,
  UnidirectionalStream,
} from "@rsocket/rsocket-types";
import { fragment, fragmentWithRequestN, isFragmentable } from "./Fragmenter";
import * as Reassembler from "./Reassembler";

export class RequestStreamRequesterStream
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
    private initialRequestN: number,
    private receiver: UnidirectionalStream,
    private streamsRegistry: StreamsRegistry
  ) {
    streamsRegistry.add(this);
  }

  handleReady(streamId: number, { outbound, fragmentSize }: StreamConfig) {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;
    this.outbound = outbound;
    this.fragmentSize = fragmentSize;

    if (
      isFragmentable(this.payload, fragmentSize, FrameTypes.REQUEST_RESPONSE)
    ) {
      for (const frame of fragmentWithRequestN(
        streamId,
        this.payload,
        fragmentSize,
        FrameTypes.REQUEST_STREAM,
        this.initialRequestN
      )) {
        this.outbound.send(frame);
      }
    } else {
      this.outbound.send({
        type: FrameTypes.REQUEST_STREAM,
        data: this.payload.data,
        metadata: this.payload.metadata,
        requestN: this.initialRequestN,
        flags: this.payload.metadata !== undefined ? Flags.METADATA : 0,
        streamId,
      });
    }

    return true;
  }

  handleReject(error: Error) {
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

          this.receiver.onNext(payload, hasComplete);
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

  request(n: number): void {
    if (this.done) {
      return;
    }

    if (!this.streamId) {
      this.initialRequestN += n;
      return;
    }

    this.outbound.send({
      type: FrameTypes.REQUEST_N,
      flags: Flags.NONE,
      requestN: n,
      streamId: this.streamId,
    });
  }

  cancel(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.streamsRegistry.remove(this);
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
