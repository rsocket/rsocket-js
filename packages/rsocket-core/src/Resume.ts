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

import { ErrorCodes, ExtFrame, RSocketError } from ".";
import { sizeOfFrame } from "./Codecs";
import {
  CancelFrame,
  ErrorFrame,
  MetadataPushFrame,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
} from "./Frames";

export class FrameStore {
  private readonly storedFrames: Array<
    | CancelFrame
    | ErrorFrame
    | PayloadFrame
    | MetadataPushFrame
    | RequestChannelFrame
    | RequestFnfFrame
    | RequestNFrame
    | RequestResponseFrame
    | RequestStreamFrame
    | ExtFrame
  > = [];
  private _lastReceivedFramePosition: number = 0;
  private _firstAvailableFramePosition: number = 0;
  private _lastSentFramePosition: number = 0;

  get lastReceivedFramePosition(): number {
    return this._lastReceivedFramePosition;
  }

  get firstAvailableFramePosition(): number {
    return this._firstAvailableFramePosition;
  }

  get lastSentFramePosition(): number {
    return this._lastSentFramePosition;
  }

  store(
    frame:
      | CancelFrame
      | ErrorFrame
      | PayloadFrame
      | MetadataPushFrame
      | RequestChannelFrame
      | RequestFnfFrame
      | RequestNFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | ExtFrame
  ): void {
    this._lastSentFramePosition += sizeOfFrame(frame);
    this.storedFrames.push(frame);
  }

  record(
    frame:
      | CancelFrame
      | ErrorFrame
      | PayloadFrame
      | MetadataPushFrame
      | RequestChannelFrame
      | RequestFnfFrame
      | RequestNFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | ExtFrame
  ): void {
    this._lastReceivedFramePosition += sizeOfFrame(frame);
  }

  dropTo(lastReceivedPosition: number): void {
    let bytesToDrop = lastReceivedPosition - this._firstAvailableFramePosition;
    while (bytesToDrop > 0 && this.storedFrames.length > 0) {
      const storedFrame = this.storedFrames.shift();
      bytesToDrop -= sizeOfFrame(storedFrame);
    }

    if (bytesToDrop !== 0) {
      throw new RSocketError(
        ErrorCodes.CONNECTION_ERROR,
        `State inconsistency. Expected bytes to drop ${
          lastReceivedPosition - this._firstAvailableFramePosition
        } but actual ${bytesToDrop}`
      );
    }

    this._firstAvailableFramePosition = lastReceivedPosition;
  }

  drain(
    consumer: (
      frame:
        | CancelFrame
        | ErrorFrame
        | PayloadFrame
        | MetadataPushFrame
        | RequestChannelFrame
        | RequestFnfFrame
        | RequestNFrame
        | RequestResponseFrame
        | RequestStreamFrame
        | ExtFrame
    ) => void
  ) {
    for (const frame of this.storedFrames) {
      consumer(frame);
    }
  }
}
