import { ErrorCodes, RSocketError } from "./Errors";
import { fragment, fragmentWithRequestN, isFragmentable } from "./Fragmenter";
import {
  CancelFrame,
  ErrorFrame,
  ExtFrame,
  Flags,
  FrameTypes,
  PayloadFrame,
  RequestNFrame,
  RequestStreamFrame,
} from "./Frames";
import { LeaseManager } from "./Lease";
import * as Reassembler from "./Reassembler";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
} from "./RSocket";
import {
  Stream,
  StreamFrameHandler,
  StreamLifecycleHandler,
} from "./Transport";

export class RequestStreamRequesterStream
  implements
    Cancellable,
    Requestable,
    OnExtensionSubscriber,
    StreamFrameHandler,
    StreamLifecycleHandler,
    Reassembler.FragmentsHolder
{
  readonly streamType = FrameTypes.REQUEST_STREAM;

  private done: boolean;
  private stream: Stream;

  private hasExtension: boolean;
  private extendedType: number;
  private extendedContent: Buffer;
  private flags: number;

  hasFragments: boolean;
  data: Buffer;
  metadata: Buffer;

  streamId: number;

  constructor(
    private readonly payload: Payload,
    private readonly receiver: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber,
    private readonly fragmentSize: number,
    private initialRequestN: number,
    private readonly leaseManager?: LeaseManager
  ) {
    // TODO: add payload size validation
  }

  handleReady(streamId: number, stream: Stream) {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;
    this.stream = stream;

    stream.connect(this);

    if (
      isFragmentable(this.payload, this.fragmentSize, FrameTypes.REQUEST_STREAM)
    ) {
      for (const frame of fragmentWithRequestN(
        streamId,
        this.payload,
        this.fragmentSize,
        FrameTypes.REQUEST_STREAM,
        this.initialRequestN
      )) {
        this.stream.send(frame);
      }
    } else {
      this.stream.send({
        type: FrameTypes.REQUEST_STREAM,
        data: this.payload.data,
        metadata: this.payload.metadata,
        requestN: this.initialRequestN,
        flags: this.payload.metadata !== undefined ? Flags.METADATA : 0,
        streamId,
      });
    }

    if (this.hasExtension) {
      this.stream.send({
        type: FrameTypes.EXT,
        streamId,
        extendedContent: this.extendedContent,
        extendedType: this.extendedType,
        flags: this.flags,
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

  handle(frame: PayloadFrame | ErrorFrame | ExtFrame): void {
    let errorMessage: string;
    const frameType = frame.type;
    switch (frameType) {
      case FrameTypes.PAYLOAD: {
        const hasComplete = Flags.hasComplete(frame.flags);
        const hasNext = Flags.hasNext(frame.flags);

        if (hasComplete || !Flags.hasFollows(frame.flags)) {
          if (hasComplete) {
            this.done = true;

            this.stream.disconnect(this);

            if (!hasNext) {
              // TODO: add validation no frame in reassembly
              this.receiver.onComplete();
              return;
            }
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

        if (!Reassembler.add(this, frame.data, frame.metadata)) {
          errorMessage = "Unexpected fragment size";
          break;
        }
        return;
      }

      case FrameTypes.ERROR: {
        this.done = true;

        this.stream.disconnect(this);

        Reassembler.cancel(this);

        this.receiver.onError(new RSocketError(frame.code, frame.message));
        return;
      }

      case FrameTypes.EXT: {
        if (this.hasFragments) {
          errorMessage = `Unexpected frame type [${frameType}] during reassembly`;
          break;
        }
        this.receiver.onExtension(
          frame.extendedType,
          frame.extendedContent,
          Flags.hasIgnore(frame.flags)
        );
        return;
      }

      default: {
        errorMessage = `Unexpected frame type [${frameType}]`;
      }
    }

    this.close(new RSocketError(ErrorCodes.CANCELED, errorMessage));
    this.stream.send({
      type: FrameTypes.CANCEL,
      streamId: this.streamId,
      flags: Flags.NONE,
    });
    this.stream.disconnect(this);
    // TODO: throw an exception if strict frame handling mode
  }

  request(n: number): void {
    if (this.done) {
      return;
    }

    if (!this.streamId) {
      this.initialRequestN += n;
      return;
    }

    this.stream.send({
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

    if (!this.streamId) {
      this.leaseManager?.cancelRequest(this);
      return;
    }
    this.stream.send({
      type: FrameTypes.CANCEL,
      flags: Flags.NONE,
      streamId: this.streamId,
    });

    this.stream.disconnect(this);

    Reassembler.cancel(this);
  }

  onExtension(
    extendedType: number,
    content: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void {
    if (this.done) {
      return;
    }

    if (!this.streamId) {
      this.hasExtension = true;
      this.extendedType = extendedType;
      this.extendedContent = content;
      this.flags = canBeIgnored ? Flags.IGNORE : Flags.NONE;
      return;
    }

    this.stream.send({
      streamId: this.streamId,
      type: FrameTypes.EXT,
      extendedType,
      extendedContent: content,
      flags: canBeIgnored ? Flags.IGNORE : Flags.NONE,
    });
  }

  close(error?: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;

    Reassembler.cancel(this);

    if (error) {
      this.receiver.onError(error);
    } else {
      this.receiver.onComplete();
    }
  }
}

export class RequestStreamResponderStream
  implements
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    StreamFrameHandler,
    Reassembler.FragmentsHolder
{
  readonly streamType = FrameTypes.REQUEST_STREAM;

  private readonly initialRequestN: number;
  private receiver?: Cancellable & Requestable & OnExtensionSubscriber;
  private done: boolean;

  hasFragments: boolean;
  data: Buffer;
  metadata: Buffer;

  constructor(
    readonly streamId: number,
    private readonly stream: Stream,
    private readonly fragmentSize: number,
    private readonly handler: (
      payload: Payload,
      initialRequestN: number,
      senderStream: OnTerminalSubscriber &
        OnNextSubscriber &
        OnExtensionSubscriber
    ) => Cancellable & Requestable & OnExtensionSubscriber,
    frame: RequestStreamFrame
  ) {
    stream.connect(this);

    if (Flags.hasFollows(frame.flags)) {
      this.initialRequestN = frame.requestN;
      Reassembler.add(this, frame.data, frame.metadata);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };

    try {
      this.receiver = handler(payload, frame.requestN, this);
    } catch (error) {
      this.onError(error);
    }
  }

  handle(
    frame: CancelFrame | ErrorFrame | PayloadFrame | RequestNFrame | ExtFrame
  ): void {
    let errorMessage: string;
    if (!this.receiver || this.hasFragments) {
      if (frame.type === FrameTypes.PAYLOAD) {
        if (Flags.hasFollows(frame.flags)) {
          if (Reassembler.add(this, frame.data, frame.metadata)) {
            return;
          }
          errorMessage = `Unexpected frame size`;
        } else {
          const payload = Reassembler.reassemble(
            this,
            frame.data,
            frame.metadata
          );

          try {
            this.receiver = this.handler(payload, this.initialRequestN, this);
          } catch (error) {
            this.onError(error);
          }

          return;
        }
      } else {
        errorMessage = `Unexpected frame type [${frame.type}] during reassembly`;
      }
    } else if (frame.type === FrameTypes.REQUEST_N) {
      this.receiver.request(frame.requestN);
      return;
    } else if (frame.type === FrameTypes.EXT) {
      this.receiver.onExtension(
        frame.extendedType,
        frame.extendedContent,
        Flags.hasIgnore(frame.flags)
      );
      return;
    } else {
      errorMessage = `Unexpected frame type [${frame.type}]`;
    }

    this.done = true;

    Reassembler.cancel(this);

    this.receiver?.cancel();

    if (frame.type !== FrameTypes.CANCEL && frame.type !== FrameTypes.ERROR) {
      this.stream.send({
        type: FrameTypes.ERROR,
        flags: Flags.NONE,
        code: ErrorCodes.CANCELED,
        message: errorMessage,
        streamId: this.streamId,
      });
    }

    this.stream.disconnect(this);
    // TODO: throws if strict
  }

  onError(error: Error): void {
    if (this.done) {
      console.warn(
        `Trying to error for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    this.done = true;

    this.stream.send({
      type: FrameTypes.ERROR,
      flags: Flags.NONE,
      code:
        error instanceof RSocketError
          ? error.code
          : ErrorCodes.APPLICATION_ERROR,
      message: error.message,
      streamId: this.streamId,
    });

    this.stream.disconnect(this);
  }

  onNext(payload: Payload, isCompletion: boolean): void {
    if (this.done) {
      return;
    }

    if (isCompletion) {
      this.done = true;
    }

    // TODO: add payload size validation

    if (isFragmentable(payload, this.fragmentSize, FrameTypes.PAYLOAD)) {
      for (const frame of fragment(
        this.streamId,
        payload,
        this.fragmentSize,
        FrameTypes.PAYLOAD,
        isCompletion
      )) {
        this.stream.send(frame);
      }
    } else {
      this.stream.send({
        type: FrameTypes.PAYLOAD,
        flags:
          Flags.NEXT |
          (isCompletion ? Flags.COMPLETE : Flags.NONE) |
          (payload.metadata ? Flags.METADATA : Flags.NONE),
        data: payload.data,
        metadata: payload.metadata,
        streamId: this.streamId,
      });
    }

    if (isCompletion) {
      this.stream.disconnect(this);
    }
  }

  onComplete(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.stream.send({
      type: FrameTypes.PAYLOAD,
      flags: Flags.COMPLETE,
      streamId: this.streamId,
      data: null,
      metadata: null,
    });

    this.stream.disconnect(this);
  }

  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {
    if (this.done) {
      return;
    }

    this.stream.send({
      type: FrameTypes.EXT,
      streamId: this.streamId,
      flags: canBeIgnored ? Flags.IGNORE : Flags.NONE,
      extendedType,
      extendedContent: content,
    });
  }

  close(error?: Error): void {
    if (this.done) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    Reassembler.cancel(this);

    this.receiver?.cancel();
  }
}
