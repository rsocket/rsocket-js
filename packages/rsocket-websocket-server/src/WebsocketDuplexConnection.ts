import {
  Deferred,
  deserializeFrame,
  DuplexConnection,
  FlowControl,
  FlowControlledFrameHandler,
  Frame,
  serializeFrame,
} from "@rsocket/rsocket-core";
import { Duplex } from "stream";

export class WebsocketDuplexConnection
  extends Deferred
  implements DuplexConnection {
  private handler: FlowControlledFrameHandler;

  private state = FlowControl.NEXT;
  private readonly resolver = (controlAction: FlowControl) => {
    if (this.state === undefined) {
      this.state = controlAction;
      if (this.websocketDuplex.isPaused()) {
        this.websocketDuplex.resume();
      }
    }
  };

  constructor(private websocketDuplex: Duplex) {
    super();

    websocketDuplex.addListener("close", this.handleClosed.bind(this));
    websocketDuplex.addListener("error", this.handleError.bind(this));
    websocketDuplex.addListener("data", this.handleMessage.bind(this));
  }

  handle(handler: FlowControlledFrameHandler): void {
    if (this.handler) {
      throw new Error("Handle has already been installed");
    }

    this.handler = handler;
  }

  get availability(): number {
    return this.websocketDuplex.destroyed ? 0 : 1;
  }

  close(error?: Error) {
    if (this.done) {
      super.close(error);
      return;
    }

    this.websocketDuplex.removeAllListeners();
    this.websocketDuplex.end();

    delete this.websocketDuplex;

    super.close(error);
  }

  send(frame: Frame): void {
    if (this.done) {
      return;
    }

    //   if (__DEV__) {
    //     if (this._options.debug) {
    //       console.log(printFrame(frame));
    //     }
    //   }
    const buffer = /* this._options.lengthPrefixedFrames
          ? serializeFrameWithLength(frame, this._encoders)
          :*/ serializeFrame(
      frame
    );
    // if (!this._socket) {
    //   throw new Error(
    //     "RSocketWebSocketClient: Cannot send frame, not connected."
    //   );
    // }
    this.websocketDuplex.write(buffer);
  }

  private handleClosed(e: CloseEvent): void {
    this.close(
      new Error(
        e.reason || "WebsocketDuplexConnection: Socket closed unexpectedly."
      )
    );
  }

  private handleError(e: ErrorEvent): void {
    this.close(e.error);
  }

  private handleMessage = (buffer: Buffer): void => {
    try {
      const frame = /* this._options.lengthPrefixedFrames
          ? deserializeFrameWithLength(buffer, this._encoders)
          :  */ deserializeFrame(
        buffer
      );
      // if (__DEV__) {
      //   if (this._options.debug) {
      //     console.log(printFrame(frame));
      //   }
      // }
      switch (this.state) {
        case FlowControl.NEXT: {
          this.state = undefined;
          this.handler.handle(frame, this.resolver);
          if (this.state === undefined) {
            this.websocketDuplex.pause();
          }
          return;
        }
        case FlowControl.ALL: {
          this.handler.handle(frame);
          return;
        }
      }
    } catch (error) {
      this.close(error);
    }
  };
}
