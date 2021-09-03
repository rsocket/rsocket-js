import { ErrorCodes, RSocketError } from "./Errors";
import { fragment, isFragmentable } from "./Fragmenter";
import {
  CancelFrame,
  ErrorFrame,
  Flags,
  FrameTypes,
  PayloadFrame,
  RequestFnfFrame,
  RequestNFrame,
} from "./Frames";
import { LeaseManager } from "./Lease";
import * as Reassembler from "./Reassembler";
import { Cancellable, OnTerminalSubscriber, Payload } from "./RSocket";
import {
  Stream,
  StreamFrameHandler,
  StreamLifecycleHandler,
} from "./Transport";

export class RequestFnFRequesterHandler
  implements Cancellable, StreamLifecycleHandler, StreamFrameHandler {
  readonly streamType = FrameTypes.REQUEST_FNF;

  private done: boolean;

  streamId: number;

  constructor(
    private readonly payload: Payload,
    private readonly receiver: OnTerminalSubscriber,
    private readonly fragmentSize: number,
    private readonly leaseManager?: LeaseManager
  ) {}

  handleReady(streamId: number, stream: Stream) {
    if (this.done) {
      return false;
    }

    this.streamId = streamId;

    if (
      isFragmentable(this.payload, this.fragmentSize, FrameTypes.REQUEST_FNF)
    ) {
      for (const frame of fragment(
        streamId,
        this.payload,
        this.fragmentSize,
        FrameTypes.REQUEST_FNF
      )) {
        stream.send(frame);
      }
    } else {
      stream.send({
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

    this.leaseManager?.remove(this);
  }

  handle() {
    this.close(new RSocketError(ErrorCodes.CANCELED, "Received invalid frame"));
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

    if (error) {
      this.receiver.onError(error);
    } else {
      this.receiver.onComplete();
    }
  }
}

export class RequestFnfResponderHandler
  implements
    OnTerminalSubscriber,
    StreamFrameHandler,
    Reassembler.FragmentsHolder {
  readonly streamType = FrameTypes.REQUEST_FNF;

  private cancellable?: Cancellable;
  private done: boolean;

  hasFragments: boolean;
  data: Buffer;
  metadata: Buffer;

  constructor(
    readonly streamId: number,
    private stream: Stream,
    private handler: (
      payload: Payload,
      senderStream: OnTerminalSubscriber
    ) => Cancellable,
    frame: RequestFnfFrame
  ) {
    if (Flags.hasFollows(frame.flags)) {
      Reassembler.add(this, frame.data, frame.metadata);
      stream.add(this);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };
    this.cancellable = handler(payload, this);
  }

  handle(frame: CancelFrame | ErrorFrame | PayloadFrame | RequestNFrame): void {
    if (frame.type == FrameTypes.PAYLOAD) {
      if (Flags.hasFollows(frame.flags)) {
        Reassembler.add(this, frame.data, frame.metadata);
        return;
      }

      this.stream.remove(this);

      const payload = Reassembler.reassemble(this, frame.data, frame.metadata);
      this.cancellable = this.handler(payload, this);
      return;
    }

    this.done = true;

    this.stream.remove(this);

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
