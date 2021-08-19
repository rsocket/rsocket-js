import { RSocketError } from ".";
import { Closeable } from "./Common";
import { ErrorCodes } from "./Errors";
import {
  ErrorFrame,
  Flags,
  Frame,
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
  SocketAcceptor,
  StreamFrameHandler,
  StreamLifecycleHandler,
  StreamsRegistry,
} from "./RSocket";
import {
  DuplexConnection,
  FlowControl,
  FlowControlledFrameHandler,
  FrameHandler,
  Outbound,
} from "./Transport";

type ServerConfig = {
  fragmentSize: number;
  keepAlive: {
    hasSender: boolean;
  };
  streamIdSupplier: (occupiedIds: Array<number>) => number;
  acceptor: SocketAcceptor;
};

type ClientConfig = {
  fragmentSize: number;
  keepAlive: {
    timeout: number;
    period: number;
  };
  streamIdSupplier: (occupiedIds: Array<number>) => number;
  responder: Partial<RSocket>;
};

function isServerConfig(
  config: ClientConfig | ServerConfig
): config is ServerConfig {
  return config["acceptor"] !== undefined;
}

export class ClientServerInputMultiplexerDemultiplexer
  implements Closeable, StreamsRegistry, FlowControlledFrameHandler {
  private done: boolean;
  private readonly registry: { [id: number]: StreamFrameHandler } = {};
  private readonly config: ClientConfig | ServerConfig;

  private delegateHandler: FlowControlledFrameHandler & {
    close: (error?: Error) => void;
  };

  constructor(
    private readonly connection: DuplexConnection,
    config: ClientConfig | ServerConfig
  ) {
    this.config = config;
    this.delegateHandler = isServerConfig(config)
      ? new SetupFrameHandler(this, connection, config)
      : new GenericFrameHandler(
          new RequestFrameHandler(
            this,
            connection,
            config.fragmentSize,
            config.responder
          ),
          new ConnectionFrameHandler(
            this,
            new KeepAliveHandler(this, connection, config.keepAlive.timeout),
            config.responder
          ),
          this,
          new KeepAliveSender(connection, config.keepAlive.period)
        );

    connection.onClose(this.clean.bind(this));
    connection.handle(this);
  }

  handle(frame: Frame, callback?: (controlRequest: FlowControl) => void): void {
    this.delegateHandler.handle(frame, callback);
  }

  get(streamId: number): StreamFrameHandler {
    return this.registry[streamId];
  }

  add(stream: StreamFrameHandler & StreamLifecycleHandler): void {
    if (this.done) {
      stream.handleReject(new Error("Already closed"));
      return;
    }

    const registry = this.registry;
    const streamId = this.config.streamIdSupplier(
      (Object.keys(registry) as any) as Array<number>
    );

    this.registry[streamId] = stream;

    if (
      !stream.handleReady(streamId, {
        outbound: this.connection,
        fragmentSize: this.config.fragmentSize,
      })
    ) {
      // TODO: return stream id
    }
  }

  remove(stream: StreamFrameHandler): void {
    delete this.registry[stream.streamId];
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

    this.clean(error);

    this.connection.close(error);
  }

  private clean(error?: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;

    for (const streamId in this.registry) {
      const stream = this.registry[streamId];

      stream.close(
        new Error(`Closed. ${error ? `Original cause [${error}].` : ""}`)
      );
    }

    this.delegateHandler.close(error);
  }

  onClose(callback): void {
    this.connection.onClose(callback);
  }
}

class RequestFrameHandler implements FrameHandler {
  constructor(
    private registry: StreamsRegistry,
    private outbound: Outbound,
    private fragmentSize: number,
    private rsocket: Partial<RSocket>
  ) {}

  handle(
    frame:
      | RequestFnfFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | RequestChannelFrame
  ): void {
    switch (frame.type) {
      case FrameTypes.REQUEST_FNF:
        if (this.rsocket.fireAndForget) {
          new RequestFnfResponderHandler(
            frame.streamId,
            this.registry,
            this.rsocket.fireAndForget.bind(this.rsocket),
            frame
          );
        }
        return;
      case FrameTypes.REQUEST_RESPONSE:
        if (this.rsocket.requestResponse) {
          new RequestResponseResponderStream(
            frame.streamId,
            this.registry,
            this.outbound,
            this.fragmentSize,
            this.rsocket.requestResponse.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId);

        return;

      case FrameTypes.REQUEST_STREAM:
        if (this.rsocket.requestStream) {
          new RequestStreamResponderStream(
            frame.streamId,
            this.registry,
            this.outbound,
            this.fragmentSize,
            this.rsocket.requestStream.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId);

        return;

      case FrameTypes.REQUEST_CHANNEL:
        if (this.rsocket.requestChannel) {
          new RequestChannelResponderStream(
            frame.streamId,
            this.registry,
            this.outbound,
            this.fragmentSize,
            this.rsocket.requestChannel.bind(this.rsocket),
            frame
          );
          return;
        }

        this.rejectRequest(frame.streamId);

        return;
    }
  }

  rejectRequest(streamId: number) {
    this.outbound.send({
      type: FrameTypes.ERROR,
      streamId,
      flags: Flags.NONE,
      code: ErrorCodes.REJECTED,
      message: "No available handler found",
    });
  }
}

class GenericFrameHandler implements FlowControlledFrameHandler {
  constructor(
    private requestHandler: RequestFrameHandler,
    private connectionHandler: ConnectionFrameHandler,
    private registry: StreamsRegistry,
    private keepAliveSender: KeepAliveSender | undefined
  ) {}

  handle(frame: Frame): void {
    if (frame.type === FrameTypes.RESERVED) {
      // TODO: throw
      return;
    }

    if (Frame.isConnection(frame)) {
      this.connectionHandler.handle(frame);
      // TODO: Connection Handler
    } else if (Frame.isRequest(frame)) {
      if (this.registry.get(frame.streamId)) {
        // TODO: Send error and close connection
        return;
      }

      this.requestHandler.handle(frame);
    } else {
      const handler = this.registry.get(frame.streamId);
      if (!handler) {
        // TODO: add validation
        return;
      }

      handler.handle(frame);
    }

    // TODO: add extensions support
  }

  close(error?: Error): void {
    this.connectionHandler.close(error);
    this.keepAliveSender?.close();
  }
}

class ConnectionFrameHandler implements FrameHandler {
  constructor(
    private readonly multiplexere: ClientServerInputMultiplexerDemultiplexer,
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
        this.multiplexere.close(new RSocketError(frame.code, frame.message));
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

class KeepAliveHandler implements FrameHandler {
  private keepAliveLastReceivedMillis = Date.now();
  private activeTimeout: any;

  constructor(
    private readonly multiplexer: ClientServerInputMultiplexerDemultiplexer,
    private readonly outbound: Outbound,
    private keepAliveTimeoutDuration: number
  ) {
    this.activeTimeout = setTimeout(
      this.timeoutCheck.bind(this),
      keepAliveTimeoutDuration
    );
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

  close() {
    clearTimeout(this.activeTimeout);
  }

  private timeoutCheck() {
    const now = Date.now();
    const noKeepAliveDuration = now - this.keepAliveLastReceivedMillis;
    if (noKeepAliveDuration >= this.keepAliveTimeoutDuration) {
      this.multiplexer.close(
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

class KeepAliveSender {
  private activeInterval: any;

  constructor(
    private readonly outbound: Outbound,
    keepAlivePeriodDuration: number
  ) {
    this.activeInterval = setInterval(
      this.sendKeepAlive.bind(this),
      keepAlivePeriodDuration
    );
  }

  private sendKeepAlive() {
    this.outbound.send({
      type: FrameTypes.KEEPALIVE,
      streamId: 0,
      data: undefined,
      flags: Flags.RESPOND,
      lastReceivedPosition: 0,
    });
  }

  close(): void {
    clearInterval(this.activeInterval);
  }
}

class SetupFrameHandler implements FlowControlledFrameHandler {
  private done: boolean;
  private error: Error | undefined;

  constructor(
    private readonly multiplexer: ClientServerInputMultiplexerDemultiplexer,
    private readonly outbound: Outbound,
    private readonly config: ServerConfig
  ) {}

  handle(
    frame:
      | SetupFrame
      | ResumeFrame
      | ResumeOkFrame
      | LeaseFrame
      | KeepAliveFrame
      | ErrorFrame
      | MetadataPushFrame,
    callback?: (controlRequest: FlowControl) => void
  ): void {
    if (frame.type === FrameTypes.SETUP) {
      this.config.acceptor
        .accept(
          {
            data: frame.data,
            dataMimeType: frame.dataMimeType,
            metadata: frame.metadata,
            metadataMimeType: frame.metadataMimeType,
            flags: frame.flags,
            keepAliveMaxLifetime: frame.lifetime,
            keepAliveInterval: frame.keepAlive,
            resumeToken: frame.resumeToken,
          },
          new RSocketRequester(this.multiplexer)
        )
        .then(
          (responder) => {
            if (this.done) {
              responder.close?.call(responder, this.error);
              return;
            }

            this.multiplexer["delegateHandler"] = new GenericFrameHandler(
              new RequestFrameHandler(
                this.multiplexer,
                this.outbound,
                this.config.fragmentSize,
                responder
              ),
              new ConnectionFrameHandler(
                this.multiplexer,
                new KeepAliveHandler(
                  this.multiplexer,
                  this.outbound,
                  frame.lifetime
                ),
                responder
              ),
              this.multiplexer,
              this.config.keepAlive.hasSender
                ? new KeepAliveSender(this.outbound, frame.keepAlive)
                : undefined
            );

            callback(FlowControl.ALL);
          },
          (error) => this.multiplexer.close(error)
        );
      return;
    }
    // TODO: throw an exception and close connection
  }

  close(error?: Error): void {
    this.done = true;
    this.error = error;
    // FIXME: send reject frame
  }
}

export class RSocketRequester implements RSocket {
  constructor(private multiplexer: ClientServerInputMultiplexerDemultiplexer) {}

  fireAndForget(
    payload: Payload,
    responderStream: OnTerminalSubscriber
  ): Cancellable {
    return new RequestFnFRequesterHandler(
      payload,
      responderStream,
      this.multiplexer
    );
  }

  requestResponse(
    payload: Payload,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Cancellable & OnExtensionSubscriber {
    return new RequestResponseRequesterStream(
      payload,
      responderStream,
      this.multiplexer
    );
  }

  requestStream(
    payload: Payload,
    initialRequestN: number,
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ): Requestable & OnExtensionSubscriber & Cancellable {
    return new RequestStreamRequesterStream(
      payload,
      initialRequestN,
      responderStream,
      this.multiplexer
    );
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
    return new RequestChannelRequesterStream(
      payload,
      initialRequestN,
      isCompleted,
      responderStream,
      this.multiplexer
    );
  }

  metadataPush(metadata: Buffer, responderStream: OnTerminalSubscriber): void {
    throw new Error("Method not implemented.");
  }

  close(error?: Error): void {
    this.multiplexer.close();
  }

  onClose(callback): void {
    this.multiplexer.onClose(callback);
  }
}
