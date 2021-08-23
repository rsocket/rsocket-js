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
    Reassembler.FragmentsHolder {
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
    private initialRequestN: number
  ) {
    // TODO: add payload size validation
  }

  handleReady(streamId: number, stream: Stream) {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;
    this.stream = stream;

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

  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void {
    switch (frame.type) {
      case FrameTypes.PAYLOAD: {
        const hasComplete = Flags.hasComplete(frame.flags);
        const hasNext = Flags.hasNext(frame.flags);

        if (hasComplete || !Flags.hasFollows(frame.flags)) {
          if (hasComplete) {
            this.done = true;

            this.stream.remove(this);

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

        Reassembler.add(this, frame.data, frame.metadata);
        return;
      }

      case FrameTypes.ERROR: {
        this.done = true;

        this.stream.remove(this);

        Reassembler.cancel(this);

        this.receiver.onError(new RSocketError(frame.code, frame.message));
        return;
      }

      case FrameTypes.EXT: {
        this.receiver.onExtension(
          frame.extendedType,
          frame.extendedContent,
          Flags.hasIgnore(frame.flags)
        );
        return;
      }

      default: {
        this.stream.remove(this);

        this.close(
          new RSocketError(ErrorCodes.CANCELED, "Received unexpected frame")
        );

        this.stream.send({
          type: FrameTypes.CANCEL,
          streamId: this.streamId,
          flags: Flags.NONE,
        });
        return;
        // TODO: throw an exception if strict frame handling mode
      }
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
      return;
    }

    this.stream.remove(this);
    this.stream.send({
      type: FrameTypes.CANCEL,
      flags: Flags.NONE,
      streamId: this.streamId,
    });

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
    Reassembler.FragmentsHolder {
  private receiver?: Cancellable & Requestable & OnExtensionSubscriber;
  private done: boolean;
  private initialRequestN: number;

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
    stream.add(this);

    if (Flags.hasFollows(frame.flags)) {
      this.initialRequestN = frame.requestN;
      Reassembler.add(this, frame.data, frame.metadata);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };
    this.receiver = handler(payload, frame.requestN, this);
  }

  handle(
    frame: CancelFrame | ErrorFrame | PayloadFrame | RequestNFrame | ExtFrame
  ): void {
    if (!this.receiver) {
      if (frame.type === FrameTypes.PAYLOAD) {
        if (Flags.hasFollows(frame.flags)) {
          Reassembler.add(this, frame.data, frame.metadata);
          return;
        }

        const payload = Reassembler.reassemble(
          this,
          frame.data,
          frame.metadata
        );
        this.receiver = this.handler(payload, this.initialRequestN, this);
        return;
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
    }

    this.done = true;

    this.stream.remove(this);

    Reassembler.cancel(this);

    this.receiver?.cancel();

    if (frame.type !== FrameTypes.CANCEL && frame.type !== FrameTypes.ERROR) {
      this.stream.send({
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
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    this.done = true;

    this.stream.remove(this);

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
  }

  onNext(payload: Payload, isCompletion: boolean): void {
    if (this.done) {
      return;
    }

    if (isCompletion) {
      this.done = true;

      this.stream.remove(this);
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
  }

  onComplete(): void {
    if (this.done) {
      return;
    }

    this.done = true;

    this.stream.remove(this);

    this.stream.send({
      type: FrameTypes.PAYLOAD,
      flags: Flags.COMPLETE,
      streamId: this.streamId,
      data: null,
      metadata: null,
    });
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
