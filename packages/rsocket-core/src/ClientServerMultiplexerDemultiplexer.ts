import { Deferred, Demultiplexer, Multiplexer, Stream } from ".";
import { Closeable } from "./Common";
import {
  ErrorFrame,
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
  Outbound,
  StreamFrameHandler,
  StreamLifecycleHandler,
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

export abstract class ClientServerInputMultiplexerDemultiplexer
  extends Deferred
  implements Closeable, Multiplexer, Demultiplexer, Stream {
  private readonly registry: { [id: number]: StreamFrameHandler } = {};

  private connectionFramesHandler: (
    frame:
      | SetupFrame
      | ResumeFrame
      | ResumeOkFrame
      | LeaseFrame
      | KeepAliveFrame
      | ErrorFrame
      | MetadataPushFrame
  ) => void;
  private requestFramesHandler: (
    frame:
      | RequestFnfFrame
      | RequestResponseFrame
      | RequestStreamFrame
      | RequestChannelFrame,
    stream: Stream
  ) => boolean;

  constructor(private readonly streamIdSupplier: StreamIdGenerator) {
    super();
  }

  protected handle(frame: Frame): void {
    if (frame.type === FrameTypes.RESERVED) {
      // TODO: throw
      return;
    }

    if (Frame.isConnection(frame)) {
      this.connectionFramesHandler(frame);
      // TODO: Connection Handler
    } else if (Frame.isRequest(frame)) {
      if (this.registry[frame.streamId]) {
        // TODO: Send error and close connection
        return;
      }

      this.requestFramesHandler(frame, this);
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

  connectionInbound(
    handler: (
      frame:
        | SetupFrame
        | ResumeFrame
        | ResumeOkFrame
        | LeaseFrame
        | KeepAliveFrame
        | ErrorFrame
        | MetadataPushFrame
    ) => void
  ): void {
    if (this.connectionFramesHandler) {
      throw new Error("Connection frame handler has already been installed");
    }
    this.connectionFramesHandler = handler;
  }

  handleRequestStream(
    handler: (
      frame:
        | RequestFnfFrame
        | RequestResponseFrame
        | RequestStreamFrame
        | RequestChannelFrame,
      stream: Outbound & Stream
    ) => boolean
  ): void {
    if (this.requestFramesHandler) {
      throw new Error("Stream handler has already been installed");
    }
    this.requestFramesHandler = handler;
  }

  abstract send(frame: Frame): void;

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
