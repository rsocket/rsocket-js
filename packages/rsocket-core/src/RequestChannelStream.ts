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

import { ErrorCodes, RSocketError } from "./Errors";
import { fragment, fragmentWithRequestN, isFragmentable } from "./Fragmenter";
import {
  CancelFrame,
  ErrorFrame,
  ExtFrame,
  Flags,
  FrameTypes,
  PayloadFrame,
  RequestChannelFrame,
  RequestNFrame,
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

export class RequestChannelRequesterStream
  implements
    Cancellable,
    Requestable,
    OnTerminalSubscriber,
    OnNextSubscriber,
    OnExtensionSubscriber,
    StreamFrameHandler,
    StreamLifecycleHandler,
    Reassembler.FragmentsHolder
{
  readonly streamType = FrameTypes.REQUEST_CHANNEL;

  private stream: Stream;
  private inboundDone: boolean;
  private outboundDone: boolean;

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
    private isComplete: boolean,
    private readonly receiver: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable,
    private readonly fragmentSize: number,
    private initialRequestN: number,
    private readonly leaseManager?: LeaseManager
  ) {
    // TODO: add payload size validation
  }

  handleReady(streamId: number, stream: Stream) {
    if (this.outboundDone) {
      return false;
    }

    this.streamId = streamId;
    this.stream = stream;

    stream.connect(this);

    const isCompleted = this.isComplete;
    if (isCompleted) {
      this.outboundDone = isCompleted;
    }

    if (
      isFragmentable(
        this.payload,
        this.fragmentSize,
        FrameTypes.REQUEST_CHANNEL
      )
    ) {
      for (const frame of fragmentWithRequestN(
        streamId,
        this.payload,
        this.fragmentSize,
        FrameTypes.REQUEST_CHANNEL,
        this.initialRequestN,
        isCompleted
      )) {
        this.stream.send(frame);
      }
    } else {
      this.stream.send({
        type: FrameTypes.REQUEST_CHANNEL,
        data: this.payload.data,
        metadata: this.payload.metadata,
        requestN: this.initialRequestN,
        flags:
          (this.payload.metadata !== undefined ? Flags.METADATA : Flags.NONE) |
          (isCompleted ? Flags.COMPLETE : Flags.NONE),
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
    if (this.inboundDone) {
      return;
    }

    this.inboundDone = true;
    this.outboundDone = true;

    this.receiver.onError(error);
  }

  handle(
    frame: PayloadFrame | ErrorFrame | CancelFrame | RequestNFrame | ExtFrame
  ): void {
    let errorMessage: string;
    const frameType = frame.type;
    switch (frameType) {
      case FrameTypes.PAYLOAD: {
        const hasComplete = Flags.hasComplete(frame.flags);
        const hasNext = Flags.hasNext(frame.flags);

        if (hasComplete || !Flags.hasFollows(frame.flags)) {
          if (hasComplete) {
            this.inboundDone = true;

            if (this.outboundDone) {
              this.stream.disconnect(this);
            }

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

        if (Reassembler.add(this, frame.data, frame.metadata)) {
          return;
        }

        errorMessage = `Unexpected frame size`;
        break;
      }

      case FrameTypes.CANCEL: {
        if (this.outboundDone) {
          return;
        }

        this.outboundDone = true;

        if (this.inboundDone) {
          this.stream.disconnect(this);
        }

        this.receiver.cancel();
        return;
      }

      case FrameTypes.REQUEST_N: {
        if (this.outboundDone) {
          return;
        }

        if (this.hasFragments) {
          errorMessage = `Unexpected frame type [${frameType}] during reassembly`;
          break;
        }

        this.receiver.request(frame.requestN);
        return;
      }

      case FrameTypes.ERROR: {
        const outboundDone = this.outboundDone;

        this.inboundDone = true;
        this.outboundDone = true;

        this.stream.disconnect(this);

        Reassembler.cancel(this);

        if (!outboundDone) {
          this.receiver.cancel();
        }

        this.receiver.onError(new RSocketError(frame.code, frame.message));
        return;
      }

      case FrameTypes.EXT:
        this.receiver.onExtension(
          frame.extendedType,
          frame.extendedContent,
          Flags.hasIgnore(frame.flags)
        );
        return;

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
  }

  request(n: number): void {
    if (this.inboundDone) {
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
    const inboundDone = this.inboundDone;
    const outboundDone = this.outboundDone;

    if (inboundDone && outboundDone) {
      return;
    }

    this.inboundDone = true;
    this.outboundDone = true;

    if (!outboundDone) {
      this.receiver.cancel();
    }

    if (!this.streamId) {
      this.leaseManager?.cancelRequest(this);
      return;
    }

    this.stream.send({
      type: inboundDone ? FrameTypes.ERROR : FrameTypes.CANCEL,
      flags: Flags.NONE,
      streamId: this.streamId,
      code: ErrorCodes.CANCELED,
      message: "Cancelled",
    });

    this.stream.disconnect(this);

    Reassembler.cancel(this);
  }

  onNext(payload: Payload, isComplete: boolean): void {
    if (this.outboundDone) {
      return;
    }

    if (isComplete) {
      this.outboundDone = true;

      if (this.inboundDone) {
        this.stream.disconnect(this);
      }
    }

    if (isFragmentable(payload, this.fragmentSize, FrameTypes.PAYLOAD)) {
      for (const frame of fragment(
        this.streamId,
        payload,
        this.fragmentSize,
        FrameTypes.PAYLOAD,
        isComplete
      )) {
        this.stream.send(frame);
      }
    } else {
      this.stream.send({
        type: FrameTypes.PAYLOAD,
        streamId: this.streamId,
        flags:
          Flags.NEXT |
          (payload.metadata ? Flags.METADATA : Flags.NONE) |
          (isComplete ? Flags.COMPLETE : Flags.NONE),
        data: payload.data,
        metadata: payload.metadata,
      });
    }
  }

  onComplete(): void {
    if (!this.streamId) {
      this.isComplete = true;
      return;
    }

    if (this.outboundDone) {
      return;
    }

    this.outboundDone = true;

    this.stream.send({
      type: FrameTypes.PAYLOAD,
      streamId: this.streamId,
      flags: Flags.COMPLETE,
      data: null,
      metadata: null,
    });

    if (this.inboundDone) {
      this.stream.disconnect(this);
    }
  }

  onError(error: Error): void {
    if (this.outboundDone) {
      return;
    }

    const inboundDone = this.inboundDone;

    this.outboundDone = true;
    this.inboundDone = true;

    this.stream.send({
      type: FrameTypes.ERROR,
      streamId: this.streamId,
      flags: Flags.NONE,
      code:
        error instanceof RSocketError
          ? error.code
          : ErrorCodes.APPLICATION_ERROR,
      message: error.message,
    });

    this.stream.disconnect(this);

    if (!inboundDone) {
      this.receiver.onError(error);
    }
  }

  onExtension(
    extendedType: number,
    content: Buffer | null | undefined,
    canBeIgnored: boolean
  ): void {
    if (this.outboundDone) {
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
    if (this.inboundDone && this.outboundDone) {
      return;
    }

    const inboundDone = this.inboundDone;
    const outboundDone = this.outboundDone;

    this.inboundDone = true;
    this.outboundDone = true;

    Reassembler.cancel(this);

    if (!outboundDone) {
      this.receiver.cancel();
    }

    if (!inboundDone) {
      if (error) {
        this.receiver.onError(error);
      } else {
        this.receiver.onComplete();
      }
    }
  }
}

export class RequestChannelResponderStream
  implements
    Cancellable,
    Requestable,
    OnExtensionSubscriber,
    OnTerminalSubscriber,
    OnNextSubscriber,
    Cancellable,
    StreamFrameHandler,
    Reassembler.FragmentsHolder
{
  readonly streamType = FrameTypes.REQUEST_CHANNEL;

  private receiver?: Cancellable &
    Requestable &
    OnExtensionSubscriber &
    OnTerminalSubscriber &
    OnNextSubscriber;
  private readonly initialRequestN: number;
  private readonly isComplete: boolean;

  private inboundDone: boolean;
  private defferedError: Error;
  private outboundDone: boolean;

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
      isComplete: boolean,
      senderStream: Cancellable &
        Requestable &
        OnExtensionSubscriber &
        OnTerminalSubscriber &
        OnNextSubscriber
    ) => Cancellable &
      Requestable &
      OnExtensionSubscriber &
      OnTerminalSubscriber &
      OnNextSubscriber,
    frame: RequestChannelFrame
  ) {
    stream.connect(this);

    if (Flags.hasFollows(frame.flags)) {
      Reassembler.add(this, frame.data, frame.metadata);
      this.initialRequestN = frame.requestN;
      this.isComplete = Flags.hasComplete(frame.flags);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };

    const hasComplete = Flags.hasComplete(frame.flags);
    this.inboundDone = hasComplete;

    try {
      this.receiver = handler(payload, frame.requestN, hasComplete, this);
      if (this.outboundDone && this.defferedError) {
        this.receiver.onError(this.defferedError);
      }
    } catch (error) {
      if (this.outboundDone && !this.inboundDone) {
        this.cancel();
      } else {
        this.inboundDone = true;
      }

      this.onError(error);
    }
  }

  handle(
    frame: CancelFrame | ErrorFrame | PayloadFrame | RequestNFrame | ExtFrame
  ): void {
    let errorMessage: string;
    const frameType = frame.type;
    switch (frameType) {
      case FrameTypes.PAYLOAD: {
        if (Flags.hasFollows(frame.flags)) {
          if (Reassembler.add(this, frame.data, frame.metadata)) {
            return;
          }
          errorMessage = `Unexpected frame size`;
          break;
        }

        const payload = this.hasFragments
          ? Reassembler.reassemble(this, frame.data, frame.metadata)
          : {
              data: frame.data,
              metadata: frame.metadata,
            };

        const hasComplete = Flags.hasComplete(frame.flags);

        if (!this.receiver) {
          const inboundDone = this.isComplete || hasComplete;
          if (inboundDone) {
            this.inboundDone = true;
            if (this.outboundDone) {
              this.stream.disconnect(this);
            }
          }
          try {
            this.receiver = this.handler(
              payload,
              this.initialRequestN,
              inboundDone,
              this
            );
            if (this.outboundDone && this.defferedError) {
            }
          } catch (error) {
            if (this.outboundDone && !this.inboundDone) {
              this.cancel();
            } else {
              this.inboundDone = true;
            }

            this.onError(error);
          }
        } else {
          if (hasComplete) {
            this.inboundDone = true;
            if (this.outboundDone) {
              this.stream.disconnect(this);
            }

            if (!Flags.hasNext(frame.flags)) {
              this.receiver.onComplete();
              return;
            }
          }
          this.receiver.onNext(payload, hasComplete);
        }

        return;
      }

      case FrameTypes.REQUEST_N: {
        if (!this.receiver || this.hasFragments) {
          errorMessage = `Unexpected frame type [${frameType}] during reassembly`;
          break;
        }
        this.receiver.request(frame.requestN);
        return;
      }

      case FrameTypes.ERROR:
      case FrameTypes.CANCEL: {
        const inboundDone = this.inboundDone;
        const outboundDone = this.outboundDone;

        this.inboundDone = true;
        this.outboundDone = true;

        this.stream.disconnect(this);

        Reassembler.cancel(this);

        if (!this.receiver) {
          return;
        }

        if (!outboundDone) {
          this.receiver.cancel();
        }

        if (!inboundDone) {
          const error =
            frameType === FrameTypes.CANCEL
              ? new RSocketError(ErrorCodes.CANCELED, "Cancelled")
              : new RSocketError(frame.code, frame.message);
          this.receiver.onError(error);
        }
        return;
      }

      case FrameTypes.EXT: {
        if (!this.receiver || this.hasFragments) {
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
        // TODO: throws if strict
      }
    }

    this.stream.send({
      type: FrameTypes.ERROR,
      flags: Flags.NONE,
      code: ErrorCodes.CANCELED,
      message: errorMessage,
      streamId: this.streamId,
    });
    this.stream.disconnect(this);
    this.close(new RSocketError(ErrorCodes.CANCELED, errorMessage));
  }

  onError(error: Error): void {
    if (this.outboundDone) {
      console.warn(
        `Trying to error for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    const inboundDone = this.inboundDone;

    this.outboundDone = true;
    this.inboundDone = true;

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

    if (!inboundDone) {
      if (this.receiver) {
        this.receiver.onError(error);
      } else {
        this.defferedError = error;
      }
    }
  }

  onNext(payload: Payload, isCompletion: boolean): void {
    if (this.outboundDone) {
      return;
    }

    if (isCompletion) {
      this.outboundDone = true;
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

    if (isCompletion && this.inboundDone) {
      this.stream.disconnect(this);
    }
  }

  onComplete(): void {
    if (this.outboundDone) {
      return;
    }

    this.outboundDone = true;

    this.stream.send({
      type: FrameTypes.PAYLOAD,
      flags: Flags.COMPLETE,
      streamId: this.streamId,
      data: null,
      metadata: null,
    });

    if (this.inboundDone) {
      this.stream.disconnect(this);
    }
  }

  onExtension(
    extendedType: number,
    content: Buffer,
    canBeIgnored: boolean
  ): void {
    if (this.outboundDone && this.inboundDone) {
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

  request(n: number): void {
    if (this.inboundDone) {
      return;
    }

    this.stream.send({
      type: FrameTypes.REQUEST_N,
      flags: Flags.NONE,
      streamId: this.streamId,
      requestN: n,
    });
  }

  cancel(): void {
    if (this.inboundDone) {
      return;
    }

    this.inboundDone = true;

    this.stream.send({
      type: FrameTypes.CANCEL,
      flags: Flags.NONE,
      streamId: this.streamId,
    });

    if (this.outboundDone) {
      this.stream.disconnect(this);
    }
  }

  close(error?: Error): void {
    if (this.inboundDone && this.outboundDone) {
      console.warn(
        `Trying to close for the second time. ${
          error ? `Dropping error [${error}].` : ""
        }`
      );
      return;
    }

    const inboundDone = this.inboundDone;
    const outboundDone = this.outboundDone;

    this.inboundDone = true;
    this.outboundDone = true;

    Reassembler.cancel(this);

    const receiver = this.receiver;
    if (!receiver) {
      return;
    }

    if (!outboundDone) {
      receiver.cancel();
    }

    if (!inboundDone) {
      if (error) {
        receiver.onError(error);
      } else {
        receiver.onComplete();
      }
    }
  }
}
