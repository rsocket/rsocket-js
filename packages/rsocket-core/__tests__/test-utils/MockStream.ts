import {
  CancelFrame,
  ErrorFrame,
  ExtFrame,
  Frame,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
} from "../../src/Frames";
import { Stream, StreamFrameHandler } from "../../src/Transport";

export class MockStream implements Stream {
  handler: StreamFrameHandler;
  frames: Frame[] = [];

  connect(handler: StreamFrameHandler): void {
    if (!this.handler) {
      this.handler = handler;
    }
  }

  disconnect(handler: StreamFrameHandler): void {
    if (this.handler == handler) {
      this.handler = undefined;
    }
  }

  send(
    frame:
      | CancelFrame
      | ErrorFrame
      | PayloadFrame
      | RequestChannelFrame
      | RequestFnfFrame
      | RequestNFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | ExtFrame
  ): void {
    this.frames.push(frame);
  }
}
