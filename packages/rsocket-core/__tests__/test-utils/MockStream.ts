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
  wasConnected: boolean = false;

  connect(handler: StreamFrameHandler): void {
    if (!this.handler) {
      this.wasConnected = true;
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
    // to emulate that frames can not be sent if Stream was not connected or was disconnected
    if (this.wasConnected && !this.handler) {
      return;
    }
    this.frames.push(frame);
  }
}
