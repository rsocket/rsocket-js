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
import { fragment, isFragmentable } from "./Fragmenter";
import {
  CancelFrame,
  ErrorFrame,
  Flags,
  FrameTypes,
  PayloadFrame,
  RequestFnfFrame,
} from "./Frames";
import { LeaseManager } from "./Lease";
import * as Reassembler from "./Reassembler";
import { Cancellable, OnTerminalSubscriber, Payload } from "./RSocket";
import {
  Stream,
  StreamFrameHandler,
  StreamLifecycleHandler,
} from "./Transport";

export class RequestFnFRequesterStream
  implements Cancellable, StreamLifecycleHandler, StreamFrameHandler
{
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

    this.leaseManager?.cancelRequest(this);
  }

  handle(frame: ErrorFrame) {
    if (frame.type == FrameTypes.ERROR) {
      this.close(new RSocketError(frame.code, frame.message));
      return;
    }

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

export class RequestFnfResponderStream
  implements
    OnTerminalSubscriber,
    StreamFrameHandler,
    Reassembler.FragmentsHolder
{
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
      stream.connect(this);
      return;
    }

    const payload = {
      data: frame.data,
      metadata: frame.metadata,
    };
    try {
      this.cancellable = handler(payload, this);
    } catch (e) {
      // do nothing
    }
  }

  handle(frame: CancelFrame | ErrorFrame | PayloadFrame): void {
    let errorMessage: string;
    if (frame.type == FrameTypes.PAYLOAD) {
      if (Flags.hasFollows(frame.flags)) {
        if (Reassembler.add(this, frame.data, frame.metadata)) {
          return;
        }
        errorMessage = "Unexpected fragment size";
      } else {
        this.stream.disconnect(this);

        const payload = Reassembler.reassemble(
          this,
          frame.data,
          frame.metadata
        );

        try {
          this.cancellable = this.handler(payload, this);
        } catch (e) {
          // do nothing
        }
        return;
      }
    } else {
      errorMessage = `Unexpected frame type [${frame.type}]`;
    }

    this.done = true;

    if (frame.type != FrameTypes.CANCEL && frame.type != FrameTypes.ERROR) {
      this.stream.send({
        type: FrameTypes.ERROR,
        streamId: this.streamId,
        flags: Flags.NONE,
        code: ErrorCodes.CANCELED,
        message: errorMessage,
      });
    }

    this.stream.disconnect(this);

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
