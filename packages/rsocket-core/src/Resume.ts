import { ExtFrame } from ".";
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
      // TODO terminate connection
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
