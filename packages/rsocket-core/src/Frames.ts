export enum FrameTypes {
  RESERVED = 0x00, // Reserved
  SETUP = 0x01, // Setup: Sent by client to initiate protocol processing.
  LEASE = 0x02, // Lease: Sent by Responder to grant the ability to send requests.
  KEEPALIVE = 0x03, // Keepalive: Connection keepalive.
  REQUEST_RESPONSE = 0x04, // Request Response: Request single response.
  REQUEST_FNF = 0x05, // Fire And Forget: A single one-way message.
  REQUEST_STREAM = 0x06, // Request Stream: Request a completable stream.
  REQUEST_CHANNEL = 0x07, // Request Channel: Request a completable stream in both directions.
  REQUEST_N = 0x08, // Request N: Request N more items with Reactive Streams semantics.
  CANCEL = 0x09, // Cancel Request: Cancel outstanding request.
  PAYLOAD = 0x0a, // Payload: Payload on a stream. For example, response to a request, or message on a channel.
  ERROR = 0x0b, // Error: Error at connection or application level.
  METADATA_PUSH = 0x0c, // Metadata: Asynchronous Metadata frame
  RESUME = 0x0d, // Resume: Replaces SETUP for Resuming Operation (optional)
  RESUME_OK = 0x0e, // Resume OK : Sent in response to a RESUME if resuming operation possible (optional)
  EXT = 0x3f, // Extension Header: Used To Extend more frame types as well as extensions.
}

export enum Flags {
  NONE = 0,
  COMPLETE = 0x40, // PAYLOAD, REQUEST_CHANNEL: indicates stream completion, if set onComplete will be invoked on receiver.
  FOLLOWS = 0x80, // PAYLOAD, REQUEST_XXX: indicates that frame was fragmented and requires reassembly
  IGNORE = 0x200, // (all): Ignore frame if not understood.
  LEASE = 0x40, // SETUP: Will honor lease or not.
  METADATA = 0x100, // (all): must be set if metadata is present in the frame.
  NEXT = 0x20, // PAYLOAD: indicates data/metadata present, if set onNext will be invoked on receiver.
  RESPOND = 0x80, // KEEPALIVE: should KEEPALIVE be sent by peer on receipt.
  RESUME_ENABLE = 0x80, // SETUP: Client requests resume capability if possible. Resume Identification Token present.
}

export namespace Flags {
  export function hasMetadata(flags: number): boolean {
    return (flags & Flags.METADATA) === Flags.METADATA;
  }

  export function hasComplete(flags: number): boolean {
    return (flags & Flags.COMPLETE) === Flags.COMPLETE;
  }

  export function hasNext(flags: number): boolean {
    return (flags & Flags.NEXT) === Flags.NEXT;
  }

  export function hasFollows(flags: number): boolean {
    return (flags & Flags.FOLLOWS) === Flags.FOLLOWS;
  }

  export function hasIgnore(flags: number): boolean {
    return (flags & Flags.IGNORE) === Flags.IGNORE;
  }
}

export enum Lengths {
  FRAME = 3,
  HEADER = 6,
  METADATA = 3,
  REQUEST = 3,
}

export namespace Frame {
  export function isConnection(
    frame: Frame
  ): frame is
    | SetupFrame
    | ResumeFrame
    | ResumeOkFrame
    | LeaseFrame
    | KeepAliveFrame
    | ErrorFrame
    | MetadataPushFrame {
    return frame.streamId === 0;
  }

  export function isRequest(
    frame: Frame
  ): frame is
    | RequestFnfFrame
    | RequestResponseFrame
    | RequestStreamFrame
    | RequestChannelFrame {
    return (
      FrameTypes.REQUEST_RESPONSE <= frame.type &&
      frame.type <= FrameTypes.REQUEST_CHANNEL
    );
  }
}

export type Frame =
  | CancelFrame
  | ErrorFrame
  | KeepAliveFrame
  | LeaseFrame
  | PayloadFrame
  | MetadataPushFrame
  | RequestChannelFrame
  | RequestFnfFrame
  | RequestNFrame
  | RequestResponseFrame
  | RequestStreamFrame
  | ResumeFrame
  | ResumeOkFrame
  | SetupFrame
  | ExtFrame
  | UnsupportedFrame;

export type FrameWithPayload = {
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
};

export type CancelFrame = {
  type: FrameTypes.CANCEL;
  flags: number;
  streamId: number;
};

export type ErrorFrame = {
  type: FrameTypes.ERROR;
  flags: number;
  code: number;
  message: string;
  streamId: number;
};

export type KeepAliveFrame = {
  type: FrameTypes.KEEPALIVE;
  flags: number;
  data: Buffer | null | undefined;
  lastReceivedPosition: number;
  streamId: 0;
};

export type LeaseFrame = {
  type: FrameTypes.LEASE;
  flags: number;
  ttl: number;
  requestCount: number;
  metadata: Buffer | null | undefined;
  streamId: 0;
};

export type PayloadFrame = {
  type: FrameTypes.PAYLOAD;
  flags: number;
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
  streamId: number;
};

export type MetadataPushFrame = {
  type: FrameTypes.METADATA_PUSH;
  metadata: Buffer | null | undefined;
  flags: number;
  streamId: 0;
};

export type RequestChannelFrame = {
  type: FrameTypes.REQUEST_CHANNEL;
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
  flags: number;
  requestN: number;
  streamId: number;
};

export type RequestFnfFrame = {
  type: FrameTypes.REQUEST_FNF;
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
  flags: number;
  streamId: number;
};

export type RequestNFrame = {
  type: FrameTypes.REQUEST_N;
  flags: number;
  requestN: number;
  streamId: number;
};

export type RequestResponseFrame = {
  type: FrameTypes.REQUEST_RESPONSE;
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
  flags: number;
  streamId: number;
};

export type RequestStreamFrame = {
  type: FrameTypes.REQUEST_STREAM;
  data: Buffer | null | undefined;
  metadata: Buffer | null | undefined;
  flags: number;
  requestN: number;
  streamId: number;
};

export type ResumeFrame = {
  type: FrameTypes.RESUME;
  clientPosition: number;
  flags: number;
  majorVersion: number;
  minorVersion: number;
  resumeToken: Buffer;
  serverPosition: number;
  streamId: 0;
};

export type ResumeOkFrame = {
  type: FrameTypes.RESUME_OK;
  clientPosition: number;
  flags: number;
  streamId: 0;
};

export type SetupFrame = {
  type: FrameTypes.SETUP;
  dataMimeType: string;
  data: Buffer | null | undefined;
  flags: number;
  keepAlive: number;
  lifetime: number;
  metadata: Buffer | null | undefined;
  metadataMimeType: string;
  resumeToken: Buffer | null | undefined;
  streamId: 0;
  majorVersion: number;
  minorVersion: number;
};

export type ExtFrame = {
  type: FrameTypes.EXT;
  flags: number;
  streamId: number;
  extendedType: number;
  extendedContent?: Buffer;
};

export type UnsupportedFrame = {
  type: FrameTypes.RESERVED;
  streamId: 0;
  flags: number;
};
