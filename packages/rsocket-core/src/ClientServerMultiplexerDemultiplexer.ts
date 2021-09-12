import { ErrorCodes, Flags, FrameTypes, ResumeFrame, ResumeOkFrame } from ".";
import { Closeable } from "./Common";
import { Deferred } from "./Deferred";
import { RSocketError } from "./Errors";
import { Frame } from "./Frames";
import { FrameStore } from "./Resume";
import {
  ConnectionFrameHandler,
  Demultiplexer,
  FrameHandler,
  Multiplexer,
  Outbound,
  Stream,
  StreamFrameHandler,
  StreamLifecycleHandler,
  StreamRequestHandler,
} from "./Transport";

export interface StreamIdGenerator {
  next(handler: (nextId: number) => boolean, streams: Array<number>): void;
}

export namespace StreamIdGenerator {
  export function create(seedId: number): StreamIdGenerator {
    return new StreamIdGeneratorImpl(seedId);
  }

  class StreamIdGeneratorImpl implements StreamIdGenerator {
    constructor(private currentId: number) {}

    next(handler: (nextId: number) => boolean): void {
      const nextId = this.currentId + 2;

      if (!handler(nextId)) {
        return;
      }

      this.currentId = nextId;
    }
  }
}

export class ClientServerInputMultiplexerDemultiplexer
  extends Deferred
  implements Closeable, Multiplexer, Demultiplexer, Stream, FrameHandler {
  private readonly registry: { [id: number]: StreamFrameHandler } = {};

  protected connectionFramesHandler: ConnectionFrameHandler;
  private requestFramesHandler: StreamRequestHandler;

  constructor(
    private readonly streamIdSupplier: StreamIdGenerator,
    protected outbound: Outbound,
    private readonly closeable: Closeable
  ) {
    super();

    closeable.onClose(this.close.bind(this));
  }

  handle(frame: Frame): void {
    if (Frame.isConnection(frame)) {
      if (frame.type === FrameTypes.RESERVED) {
        // TODO: throw
        return;
      }

      this.connectionFramesHandler.handle(frame);
      // TODO: Connection Handler
    } else if (Frame.isRequest(frame)) {
      if (this.registry[frame.streamId]) {
        // TODO: Send error and close connection
        return;
      }

      this.requestFramesHandler.handle(frame, this);
    } else {
      const handler = this.registry[frame.streamId];
      if (!handler) {
        // TODO: add validation
        return;
      }

      handler.handle(frame);
    }

    // TODO: add extensions support
  }

  connectionInbound(handler: ConnectionFrameHandler): void {
    if (this.connectionFramesHandler) {
      throw new Error("Connection frame handler has already been installed");
    }
    this.connectionFramesHandler = handler;
  }

  handleRequestStream(handler: StreamRequestHandler): void {
    if (this.requestFramesHandler) {
      throw new Error("Stream handler has already been installed");
    }
    this.requestFramesHandler = handler;
  }

  send(frame: Frame): void {
    this.outbound.send(frame);
  }

  get connectionOutbound(): Outbound {
    return this;
  }

  createRequestStream(
    streamHandler: StreamFrameHandler & StreamLifecycleHandler
  ): void {
    // handle requester side stream registration
    if (this.done) {
      streamHandler.handleReject(new Error("Already closed"));
      return;
    }

    const registry = this.registry;
    this.streamIdSupplier.next((streamId) => {
      registry[streamId] = streamHandler;

      return streamHandler.handleReady(streamId, this);
    }, (Object.keys(registry) as any) as Array<number>);
  }

  add(handler: StreamFrameHandler): void {
    this.registry[handler.streamId] = handler;
  }

  remove(stream: StreamFrameHandler): void {
    delete this.registry[stream.streamId];
  }

  close(error?: Error): void {
    if (this.done) {
      super.close(error);
      return;
    }
    for (const streamId in this.registry) {
      const stream = this.registry[streamId];

      stream.close(
        new Error(`Closed. ${error ? `Original cause [${error}].` : ""}`)
      );
    }
    super.close(error);
  }
}

export class ResumableClientServerInputMultiplexerDemultiplexer extends ClientServerInputMultiplexerDemultiplexer {
  private readonly sessionStore?: {
    [sessionId: string]: ResumableClientServerInputMultiplexerDemultiplexer;
  };
  private readonly reconnector?: (
    self: ResumableClientServerInputMultiplexerDemultiplexer,
    frameStore: FrameStore
  ) => Promise<void>;
  private timeoutId?: any;

  constructor(
    streamIdSupplier: StreamIdGenerator,
    outbound: Outbound,
    closeable: Closeable,
    private readonly frameStore: FrameStore,
    private readonly token: string,
    sessionStoreOrReconnector:
      | {
          [
            sessionId: string
          ]: ResumableClientServerInputMultiplexerDemultiplexer;
        }
      | ((
          self: ResumableClientServerInputMultiplexerDemultiplexer,
          frameStore: FrameStore
        ) => Promise<void>),
    private readonly sessionTimeout?: number
  ) {
    super(streamIdSupplier, outbound, new Deferred());

    if (sessionStoreOrReconnector instanceof Function) {
      this.reconnector = sessionStoreOrReconnector;
    } else {
      this.sessionStore = sessionStoreOrReconnector as {};
    }

    closeable.onClose(this.handleConnectionClose.bind(this));
  }

  send(frame: Frame): void {
    if (Frame.isConnection(frame)) {
      if (frame.type === FrameTypes.KEEPALIVE) {
        frame.lastReceivedPosition = this.frameStore.lastReceivedFramePosition;
      } else if (frame.type === FrameTypes.ERROR) {
        this.outbound.send(frame);
        if (this.sessionStore) {
          delete this.sessionStore[this.token];
        }
        super.close(new RSocketError(frame.code, frame.message));
        return;
      }
    } else {
      this.frameStore.store(frame);
    }
    this.outbound.send(frame);
  }

  handle(frame: Frame): void {
    if (Frame.isConnection(frame)) {
      if (frame.type === FrameTypes.KEEPALIVE) {
        try {
          this.frameStore.dropTo(frame.lastReceivedPosition);
        } catch (re) {
          this.outbound.send({
            type: FrameTypes.ERROR,
            streamId: 0,
            flags: Flags.NONE,
            code: (re as RSocketError).code,
            message: re.message,
          });
          this.close(re);
        }
      } else if (frame.type === FrameTypes.ERROR) {
        super.handle(frame);
        if (this.sessionStore) {
          delete this.sessionStore[this.token];
        }
        super.close(new RSocketError(frame.code, frame.message));
        return;
      }
    } else {
      this.frameStore.record(frame);
    }

    super.handle(frame);
  }

  resume(
    frame: ResumeFrame | ResumeOkFrame,
    outbound: Outbound,
    closeable: Closeable
  ) {
    this.outbound = outbound;

    switch (frame.type) {
      case FrameTypes.RESUME: {
        clearTimeout(this.timeoutId);
        if (this.frameStore.lastReceivedFramePosition < frame.clientPosition) {
          const e = new RSocketError(
            ErrorCodes.REJECTED_RESUME,
            "Impossible to resume since first available client frame position is greater than last received server frame position"
          );
          this.outbound.send({
            type: FrameTypes.ERROR,
            streamId: 0,
            flags: Flags.NONE,
            code: e.code,
            message: e.message,
          });
          this.close(e);
          return;
        }
        try {
          this.frameStore.dropTo(frame.serverPosition);
        } catch (re) {
          this.outbound.send({
            type: FrameTypes.ERROR,
            streamId: 0,
            flags: Flags.NONE,
            code: (re as RSocketError).code,
            message: re.message,
          });
          this.close(re);
          return;
        }

        this.outbound.send({
          type: FrameTypes.RESUME_OK,
          streamId: 0,
          flags: Flags.NONE,
          clientPosition: this.frameStore.lastReceivedFramePosition,
        });

        break;
      }
      case FrameTypes.RESUME_OK: {
        try {
          this.frameStore.dropTo(frame.clientPosition);
        } catch (re) {
          this.outbound.send({
            type: FrameTypes.ERROR,
            streamId: 0,
            flags: Flags.NONE,
            code: (re as RSocketError).code,
            message: re.message,
          });
          this.close(re);
        }
        break;
      }
    }

    this.frameStore.drain(this.outbound.send.bind(this.outbound));

    closeable.onClose(this.handleConnectionClose.bind(this));
    this.connectionFramesHandler.resume();
  }

  private async handleConnectionClose(_error?: Error): Promise<void> {
    this.connectionFramesHandler.pause();
    if (this.reconnector) {
      try {
        await this.reconnector(this, this.frameStore);
      } catch (e) {
        this.close(e);
      }
    } else {
      this.timeoutId = setTimeout(this.close.bind(this), this.sessionTimeout);
    }
  }
}

export class ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer
  implements Closeable, Multiplexer, Demultiplexer, FrameHandler {
  private resumed: boolean = false;
  constructor(
    private readonly outbound: Outbound,
    private readonly closeable: Closeable,
    private readonly delegate: ResumableClientServerInputMultiplexerDemultiplexer
  ) {}

  close(): void {
    this.delegate.close();
  }

  onClose(callback: (error?: Error) => void): void {
    this.delegate.onClose(callback);
  }

  get connectionOutbound(): Outbound {
    return this.delegate.connectionOutbound;
  }

  createRequestStream(
    streamHandler: StreamFrameHandler & StreamLifecycleHandler
  ): void {
    this.delegate.createRequestStream(streamHandler);
  }

  connectionInbound(handler: ConnectionFrameHandler): void {
    this.delegate.connectionInbound(handler);
  }

  handleRequestStream(handler: StreamRequestHandler): void {
    this.delegate.handleRequestStream(handler);
  }

  handle(frame: Frame): void {
    if (!this.resumed) {
      if (frame.type === FrameTypes.RESUME_OK) {
        this.resumed = true;
        this.delegate.resume(frame, this.outbound, this.closeable);
        return;
      } else {
        this.outbound.send({
          type: FrameTypes.ERROR,
          streamId: 0,
          code: ErrorCodes.CONNECTION_ERROR,
          message: `Incomplete RESUME handshake. Unexpected frame ${frame.type} received`,
          flags: Flags.NONE,
        });
        this.closeable.close();
        this.closeable.onClose(() =>
          this.delegate.close(
            new RSocketError(
              ErrorCodes.CONNECTION_ERROR,
              `Incomplete RESUME handshake. Unexpected frame ${frame.type} received`
            )
          )
        );
      }

      return;
    }

    this.delegate.handle(frame);
  }
}
