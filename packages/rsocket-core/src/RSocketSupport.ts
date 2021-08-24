import { ErrorCodes, RSocketError } from "./Errors";
import {
  ErrorFrame,
  Flags,
  FrameTypes,
  KeepAliveFrame,
  LeaseFrame,
  MetadataPushFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestResponseFrame,
  RequestStreamFrame,
  ResumeFrame,
  ResumeOkFrame,
  SetupFrame,
} from "./Frames";
import {
  RequestChannelRequesterStream,
  RequestChannelResponderStream,
} from "./RequestChannelStream";
import {
  RequestFnFRequesterHandler,
  RequestFnfResponderHandler,
} from "./RequestFnFStream";
import {
  RequestResponseRequesterStream,
  RequestResponseResponderStream,
} from "./RequestResponseStream";
import {
  RequestStreamRequesterStream,
  RequestStreamResponderStream,
} from "./RequestStreamStream";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
} from "./RSocket";
import { DuplexConnection, FrameHandler, Outbound, Stream } from "./Transport";

export class RSocketRequester implements RSocket {
  constructor(
    private readonly connection: DuplexConnection,
    private readonly fragmentSize: number
  ) {}

  fireAndForget(
    payload: Payload,
    responderStream: OnTerminalSubscriber
  ): Cancellable {
    const handler = new RequestFnFRequesterHandler(
      payload,
      responderStream,
      this.fragmentSize
    );

    this.connection.createRequestStream(handler, FrameTypes.REQUEST_FNF);

    return handler;
  }

  requestResponse(
    payload: Payload,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Cancellable & OnExtensionSubscriber {
    const handler = new RequestResponseRequesterStream(
      payload,
      responderStream,
      this.fragmentSize
    );

    this.connection.createRequestStream(handler, FrameTypes.REQUEST_RESPONSE);

    return handler;
  }

  requestStream(
    payload: Payload,
    initialRequestN: number,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Requestable & OnExtensionSubscriber & Cancellable {
    const handler = new RequestStreamRequesterStream(
      payload,
      responderStream,
      this.fragmentSize,
      initialRequestN
    );

    this.connection.createRequestStream(handler, FrameTypes.REQUEST_STREAM);

    return handler;
  }

  requestChannel(
    payload: Payload,
    initialRequestN: number,
    isCompleted: boolean,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber &
      Requestable &
      Cancellable
  ): OnTerminalSubscriber &
    OnNextSubscriber &
    OnExtensionSubscriber &
    Requestable &
    Cancellable {
    const handler = new RequestChannelRequesterStream(
      payload,
      isCompleted,
      responderStream,
      this.fragmentSize,
      initialRequestN
    );

    this.connection.createRequestStream(handler, FrameTypes.REQUEST_CHANNEL);

    return handler;
  }

  metadataPush(metadata: Buffer, responderStream: OnTerminalSubscriber): void {
    throw new Error("Method not implemented.");
  }

  close(error?: Error): void {
    this.connection.close(error);
  }

  onClose(callback): void {
    this.connection.onClose(callback);
  }
}

export class StreamHandler {
  constructor(
    private rsocket: Partial<RSocket>,
    private fragmentSize: number
  ) {}

  handle(
    frame:
      | RequestFnfFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | RequestChannelFrame,
    stream: Outbound & Stream
  ): void {
    switch (frame.type) {
      case FrameTypes.REQUEST_FNF:
        if (this.rsocket.fireAndForget) {
          new RequestFnfResponderHandler(
            frame.streamId,
            stream,
            this.rsocket.fireAndForget.bind(this.rsocket),
            frame
          );
        }
        return;
      case FrameTypes.REQUEST_RESPONSE:
        if (this.rsocket.requestResponse) {
          new RequestResponseResponderStream(
            frame.streamId,
            stream,
            this.fragmentSize,
            this.rsocket.requestResponse.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId, stream);

        return;

      case FrameTypes.REQUEST_STREAM:
        if (this.rsocket.requestStream) {
          new RequestStreamResponderStream(
            frame.streamId,
            stream,
            this.fragmentSize,
            this.rsocket.requestStream.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId, stream);

        return;

      case FrameTypes.REQUEST_CHANNEL:
        if (this.rsocket.requestChannel) {
          new RequestChannelResponderStream(
            frame.streamId,
            stream,
            this.fragmentSize,
            this.rsocket.requestChannel.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId, stream);

        return;
    }
  }

  rejectRequest(streamId: number, stream: Stream) {
    stream.send({
      type: FrameTypes.ERROR,
      streamId,
      flags: Flags.NONE,
      code: ErrorCodes.REJECTED,
      message: "No available handler found",
    });
  }
}

export class ConnectionFrameHandler implements FrameHandler {
  constructor(
    private readonly connection: DuplexConnection,
    private readonly keepAliveHandler: KeepAliveHandler,
    private readonly rsocket: Partial<RSocket>
  ) {}

  handle(
    frame:
      | SetupFrame
      | ResumeFrame
      | ResumeOkFrame
      | LeaseFrame
      | KeepAliveFrame
      | ErrorFrame
      | MetadataPushFrame
  ): void {
    switch (frame.type) {
      case FrameTypes.KEEPALIVE:
        this.keepAliveHandler.handle(frame);
        return;
      case FrameTypes.LEASE:
        // TODO: add lease handling
        return;
      case FrameTypes.ERROR:
        // TODO: add code validation
        this.connection.close(new RSocketError(frame.code, frame.message));
        return;
      case FrameTypes.METADATA_PUSH:
        if (this.rsocket.metadataPush) {
          // this.rsocket.metadataPush()
        }

        return;
      default:
      // TODO: throw an exception and close connection
    }
  }

  close(error?: Error) {
    this.keepAliveHandler.close();
    this.rsocket.close?.call(this.rsocket, error);
  }
}

export class KeepAliveHandler implements FrameHandler {
  private readonly outbound: Outbound;
  private keepAliveLastReceivedMillis: number;
  private activeTimeout: any;
  private state: number;

  constructor(
    private readonly connection: DuplexConnection,
    private readonly keepAliveTimeoutDuration: number
  ) {
    this.outbound = connection.connectionOutbound;
  }

  handle(frame: KeepAliveFrame): void {
    this.keepAliveLastReceivedMillis = Date.now();
    if (Flags.hasRespond(frame.flags)) {
      this.outbound.send({
        type: FrameTypes.KEEPALIVE,
        streamId: 0,
        data: frame.data,
        flags: frame.flags ^ Flags.RESPOND,
        lastReceivedPosition: 0,
      });
    }
  }

  start() {
    if (this.state !== 0) {
      return;
    }

    this.keepAliveLastReceivedMillis = Date.now();
    this.state = 1;
    this.activeTimeout = setTimeout(
      this.timeoutCheck.bind(this),
      this.keepAliveTimeoutDuration
    );
  }

  pause() {
    if (this.state !== 1) {
      return;
    }

    this.state = 0;
    clearTimeout(this.activeTimeout);
  }

  close() {
    this.state = 2;
    clearTimeout(this.activeTimeout);
  }

  private timeoutCheck() {
    const now = Date.now();
    const noKeepAliveDuration = now - this.keepAliveLastReceivedMillis;
    if (noKeepAliveDuration >= this.keepAliveTimeoutDuration) {
      this.connection.close(
        new Error(
          `No keep-alive acks for ${this.keepAliveTimeoutDuration} millis`
        )
      );
    } else {
      this.activeTimeout = setTimeout(
        this.timeoutCheck.bind(this),
        Math.max(100, this.keepAliveTimeoutDuration - noKeepAliveDuration)
      );
    }
  }
}

export class KeepAliveSender {
  private activeInterval: any;
  private state: number;

  constructor(
    private readonly outbound: Outbound,
    private readonly keepAlivePeriodDuration: number
  ) {}

  private sendKeepAlive() {
    this.outbound.send({
      type: FrameTypes.KEEPALIVE,
      streamId: 0,
      data: undefined,
      flags: Flags.RESPOND,
      lastReceivedPosition: 0,
    });
  }

  start() {
    if (this.state !== 0) {
      return;
    }

    this.state = 1;
    this.activeInterval = setInterval(
      this.sendKeepAlive.bind(this),
      this.keepAlivePeriodDuration
    );
  }

  pause() {
    if (this.state !== 1) {
      return;
    }
    this.state = 0;
    clearInterval(this.activeInterval);
  }

  close(): void {
    this.state = 2;
    clearInterval(this.activeInterval);
  }
}
