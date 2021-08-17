"use strict";

import {
  CancelFrame,
  ErrorFrame,
  Flags,
  Frame,
  FrameTypes,
  KeepAliveFrame,
  LeaseFrame,
  MetadataPushFrame,
  PayloadFrame,
  RequestChannelFrame,
  RequestFnfFrame,
  RequestNFrame,
  RequestResponseFrame,
  RequestStreamFrame,
  ResumeFrame,
  ResumeOkFrame,
  SetupFrame,
} from "./Frames";

export const FLAGS_MASK = 0x3ff; // low 10 bits
export const FRAME_TYPE_OFFFSET = 10; // frame type is offset 10 bytes within the uint16 containing type + flags

export const MAX_CODE = 0x7fffffff; // uint31
export const MAX_KEEPALIVE = 0x7fffffff; // uint31
export const MAX_LIFETIME = 0x7fffffff; // uint31
export const MAX_METADATA_LENGTH = 0xffffff; // uint24
export const MAX_MIME_LENGTH = 0xff; // int8
export const MAX_REQUEST_COUNT = 0x7fffffff; // uint31
export const MAX_REQUEST_N = 0x7fffffff; // uint31
export const MAX_RESUME_LENGTH = 0xffff; // uint16
export const MAX_STREAM_ID = 0x7fffffff; // uint31
export const MAX_TTL = 0x7fffffff; // uint31
export const MAX_VERSION = 0xffff; // uint16

export type Encoding = "ascii" | "base64" | "hex" | "utf8";

/**
 * Mimimum value that would overflow bitwise operators (2^32).
 */
const BITWISE_OVERFLOW = 0x100000000;

/**
 * Read a uint24 from a buffer starting at the given offset.
 */
export function readUInt24BE(buffer: Buffer, offset: number): number {
  const val1 = buffer.readUInt8(offset) << 16;
  const val2 = buffer.readUInt8(offset + 1) << 8;
  const val3 = buffer.readUInt8(offset + 2);
  return val1 | val2 | val3;
}

/**
 * Writes a uint24 to a buffer starting at the given offset, returning the
 * offset of the next byte.
 */
export function writeUInt24BE(
  buffer: Buffer,
  value: number,
  offset: number
): number {
  offset = buffer.writeUInt8(value >>> 16, offset); // 3rd byte
  offset = buffer.writeUInt8((value >>> 8) & 0xff, offset); // 2nd byte
  return buffer.writeUInt8(value & 0xff, offset); // 1st byte
}

/**
 * Read a uint64 (technically supports up to 53 bits per JS number
 * representation).
 */
export function readUInt64BE(buffer: Buffer, offset: number): number {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * BITWISE_OVERFLOW + low;
}

/**
 * Write a uint64 (technically supports up to 53 bits per JS number
 * representation).
 */
export function writeUInt64BE(
  buffer: Buffer,
  value: number,
  offset: number
): number {
  const high = (value / BITWISE_OVERFLOW) | 0;
  const low = value % BITWISE_OVERFLOW;
  offset = buffer.writeUInt32BE(high, offset); // first half of uint64
  return buffer.writeUInt32BE(low, offset); // second half of uint64
}

type FrameWithPayload = { data: Buffer; flags: number; metadata: Buffer };

/**
 * Frame header is:
 * - stream id (uint32 = 4)
 * - type + flags (uint 16 = 2)
 */
const FRAME_HEADER_SIZE = 6;

/**
 * Size of frame length and metadata length fields.
 */
const UINT24_SIZE = 3;

/**
 * Reads a frame from a buffer that is prefixed with the frame length.
 */
export function deserializeFrameWithLength(buffer: Buffer): Frame {
  const frameLength = readUInt24BE(buffer, 0);
  return deserializeFrame(buffer.slice(UINT24_SIZE, UINT24_SIZE + frameLength));
}

/**
 * Given a buffer that may contain zero or more length-prefixed frames followed
 * by zero or more bytes of a (partial) subsequent frame, returns an array of
 * the frames and an int representing the buffer offset.
 */
export function* deserializeFrames(buffer: Buffer): Generator<[Frame, number]> {
  let offset = 0;
  while (offset + UINT24_SIZE < buffer.length) {
    const frameLength = readUInt24BE(buffer, offset);
    const frameStart = offset + UINT24_SIZE;
    const frameEnd = frameStart + frameLength;
    if (frameEnd > buffer.length) {
      // not all bytes of next frame received
      break;
    }
    const frameBuffer = buffer.slice(frameStart, frameEnd);
    const frame = deserializeFrame(frameBuffer);
    offset = frameEnd;
    yield [frame, offset];
  }
}

/**
 * Writes a frame to a buffer with a length prefix.
 */
export function serializeFrameWithLength(frame: Frame): Buffer {
  const buffer = serializeFrame(frame);
  const lengthPrefixed = Buffer.allocUnsafe(buffer.length + UINT24_SIZE);
  writeUInt24BE(lengthPrefixed, buffer.length, 0);
  buffer.copy(lengthPrefixed, UINT24_SIZE);
  return lengthPrefixed;
}

/**
 * Read a frame from the buffer.
 */
export function deserializeFrame(buffer: Buffer): Frame {
  let offset = 0;
  const streamId = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   streamId >= 0,
  //   'RSocketBinaryFraming: Invalid frame, expected a positive stream id, got `%s.',
  //   streamId,
  // );
  const typeAndFlags = buffer.readUInt16BE(offset);
  offset += 2;
  const type = typeAndFlags >>> FRAME_TYPE_OFFFSET; // keep highest 6 bits
  const flags = typeAndFlags & FLAGS_MASK; // keep lowest 10 bits
  switch (type) {
    case FrameTypes.SETUP:
      return deserializeSetupFrame(buffer, streamId, flags);
    case FrameTypes.PAYLOAD:
      return deserializePayloadFrame(buffer, streamId, flags);
    case FrameTypes.ERROR:
      return deserializeErrorFrame(buffer, streamId, flags);
    case FrameTypes.KEEPALIVE:
      return deserializeKeepAliveFrame(buffer, streamId, flags);
    case FrameTypes.REQUEST_FNF:
      return deserializeRequestFnfFrame(buffer, streamId, flags);
    case FrameTypes.REQUEST_RESPONSE:
      return deserializeRequestResponseFrame(buffer, streamId, flags);
    case FrameTypes.REQUEST_STREAM:
      return deserializeRequestStreamFrame(buffer, streamId, flags);
    case FrameTypes.REQUEST_CHANNEL:
      return deserializeRequestChannelFrame(buffer, streamId, flags);
    case FrameTypes.METADATA_PUSH:
      return deserializeMetadataPushFrame(buffer, streamId, flags);
    case FrameTypes.REQUEST_N:
      return deserializeRequestNFrame(buffer, streamId, flags);
    case FrameTypes.RESUME:
      return deserializeResumeFrame(buffer, streamId, flags);
    case FrameTypes.RESUME_OK:
      return deserializeResumeOkFrame(buffer, streamId, flags);
    case FrameTypes.CANCEL:
      return deserializeCancelFrame(buffer, streamId, flags);
    case FrameTypes.LEASE:
      return deserializeLeaseFrame(buffer, streamId, flags);
    default:
    // invariant(
    //   false,
    //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
    //   getFrameTypeName(type)
    // );
  }
}

/**
 * Convert the frame to a (binary) buffer.
 */
export function serializeFrame(frame: Frame): Buffer {
  switch (frame.type) {
    case FrameTypes.SETUP:
      return serializeSetupFrame(frame);
    case FrameTypes.PAYLOAD:
      return serializePayloadFrame(frame);
    case FrameTypes.ERROR:
      return serializeErrorFrame(frame);
    case FrameTypes.KEEPALIVE:
      return serializeKeepAliveFrame(frame);
    case FrameTypes.REQUEST_FNF:
    case FrameTypes.REQUEST_RESPONSE:
      return serializeRequestFrame(frame);
    case FrameTypes.REQUEST_STREAM:
    case FrameTypes.REQUEST_CHANNEL:
      return serializeRequestManyFrame(frame);
    case FrameTypes.METADATA_PUSH:
      return serializeMetadataPushFrame(frame);
    case FrameTypes.REQUEST_N:
      return serializeRequestNFrame(frame);
    case FrameTypes.RESUME:
      return serializeResumeFrame(frame);
    case FrameTypes.RESUME_OK:
      return serializeResumeOkFrame(frame);
    case FrameTypes.CANCEL:
      return serializeCancelFrame(frame);
    case FrameTypes.LEASE:
      return serializeLeaseFrame(frame);
    default:
    // invariant(
    //   false,
    //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
    //   getFrameTypeName(frame.type)
    // );
  }
}
/**
 * Byte size of frame without size prefix
 */
export function sizeOfFrame(frame: Frame): number {
  switch (frame.type) {
    case FrameTypes.SETUP:
      return sizeOfSetupFrame(frame);
    case FrameTypes.PAYLOAD:
      return sizeOfPayloadFrame(frame);
    case FrameTypes.ERROR:
      return sizeOfErrorFrame(frame);
    case FrameTypes.KEEPALIVE:
      return sizeOfKeepAliveFrame(frame);
    case FrameTypes.REQUEST_FNF:
    case FrameTypes.REQUEST_RESPONSE:
      return sizeOfRequestFrame(frame);
    case FrameTypes.REQUEST_STREAM:
    case FrameTypes.REQUEST_CHANNEL:
      return sizeOfRequestManyFrame(frame);
    case FrameTypes.METADATA_PUSH:
      return sizeOfMetadataPushFrame(frame);
    case FrameTypes.REQUEST_N:
      return sizeOfRequestNFrame(frame);
    case FrameTypes.RESUME:
      return sizeOfResumeFrame(frame);
    case FrameTypes.RESUME_OK:
      return sizeOfResumeOkFrame(frame);
    case FrameTypes.CANCEL:
      return sizeOfCancelFrame(frame);
    case FrameTypes.LEASE:
      return sizeOfLeaseFrame(frame);
    default:
    // invariant(
    //   false,
    //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
    //   getFrameTypeName(frame.type)
    // );
  }
}

/**
 * Writes a SETUP frame into a new buffer and returns it.
 *
 * Prefix size is:
 * - version (2x uint16 = 4)
 * - keepalive (uint32 = 4)
 * - lifetime (uint32 = 4)
 * - mime lengths (2x uint8 = 2)
 */
const SETUP_FIXED_SIZE = 14;
const RESUME_TOKEN_LENGTH_SIZE = 2;
function serializeSetupFrame(frame: SetupFrame): Buffer {
  const resumeTokenLength =
    frame.resumeToken != null ? frame.resumeToken.byteLength : 0;
  const metadataMimeTypeLength =
    frame.metadataMimeType != null
      ? Buffer.byteLength(frame.metadataMimeType, "ascii")
      : 0;
  const dataMimeTypeLength =
    frame.dataMimeType != null
      ? Buffer.byteLength(frame.dataMimeType, "ascii")
      : 0;
  const payloadLength = getPayloadLength(frame);
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE +
      SETUP_FIXED_SIZE + //
      (resumeTokenLength ? RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength : 0) +
      metadataMimeTypeLength +
      dataMimeTypeLength +
      payloadLength
  );
  let offset = writeHeader(frame, buffer);
  offset = buffer.writeUInt16BE(frame.majorVersion, offset);
  offset = buffer.writeUInt16BE(frame.minorVersion, offset);
  offset = buffer.writeUInt32BE(frame.keepAlive, offset);
  offset = buffer.writeUInt32BE(frame.lifetime, offset);

  if (frame.flags & Flags.RESUME_ENABLE) {
    offset = buffer.writeUInt16BE(resumeTokenLength, offset);
    if (frame.resumeToken != null) {
      offset += frame.resumeToken.copy(buffer, offset);
    }
  }

  offset = buffer.writeUInt8(metadataMimeTypeLength, offset);
  if (frame.metadataMimeType != null) {
    offset += buffer.write(
      frame.metadataMimeType,
      offset,
      offset + metadataMimeTypeLength,
      "ascii"
    );
  }

  offset = buffer.writeUInt8(dataMimeTypeLength, offset);
  if (frame.dataMimeType != null) {
    offset += buffer.write(
      frame.dataMimeType,
      offset,
      offset + dataMimeTypeLength,
      "ascii"
    );
  }

  writePayload(frame, buffer, offset);
  return buffer;
}

function sizeOfSetupFrame(frame: SetupFrame): number {
  const resumeTokenLength =
    frame.resumeToken != null ? frame.resumeToken.byteLength : 0;
  const metadataMimeTypeLength =
    frame.metadataMimeType != null
      ? Buffer.byteLength(frame.metadataMimeType, "ascii")
      : 0;
  const dataMimeTypeLength =
    frame.dataMimeType != null
      ? Buffer.byteLength(frame.dataMimeType, "ascii")
      : 0;
  const payloadLength = getPayloadLength(frame);
  return (
    FRAME_HEADER_SIZE +
    SETUP_FIXED_SIZE + //
    (resumeTokenLength ? RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength : 0) +
    metadataMimeTypeLength +
    dataMimeTypeLength +
    payloadLength
  );
}

/**
 * Reads a SETUP frame from the buffer and returns it.
 */
function deserializeSetupFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): SetupFrame {
  // invariant(
  //   streamId === 0,
  //   'RSocketBinaryFraming: Invalid SETUP frame, expected stream id to be 0.',
  // );
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const majorVersion = buffer.readUInt16BE(offset);
  offset += 2;
  const minorVersion = buffer.readUInt16BE(offset);
  offset += 2;

  const keepAlive = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   keepAlive >= 0 && keepAlive <= MAX_KEEPALIVE,
  //   'RSocketBinaryFraming: Invalid SETUP frame, expected keepAlive to be ' +
  //     '>= 0 and <= %s. Got `%s`.',
  //   MAX_KEEPALIVE,
  //   keepAlive,
  // );

  const lifetime = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   lifetime >= 0 && lifetime <= MAX_LIFETIME,
  //   'RSocketBinaryFraming: Invalid SETUP frame, expected lifetime to be ' +
  //     '>= 0 and <= %s. Got `%s`.',
  //   MAX_LIFETIME,
  //   lifetime,
  // );

  let resumeToken = null;
  if (flags & Flags.RESUME_ENABLE) {
    const resumeTokenLength = buffer.readInt16BE(offset);
    offset += 2;
    // invariant(
    //   resumeTokenLength >= 0 && resumeTokenLength <= MAX_RESUME_LENGTH,
    //   'RSocketBinaryFraming: Invalid SETUP frame, expected resumeToken length ' +
    //     'to be >= 0 and <= %s. Got `%s`.',
    //   MAX_RESUME_LENGTH,
    //   resumeTokenLength,
    // );
    resumeToken = buffer.slice(offset, offset + resumeTokenLength);
    offset += resumeTokenLength;
  }

  const metadataMimeTypeLength = buffer.readUInt8(offset);
  offset += 1;
  const metadataMimeType = buffer.toString(
    "ascii",
    offset,
    offset + metadataMimeTypeLength
  );
  offset += metadataMimeTypeLength;

  const dataMimeTypeLength = buffer.readUInt8(offset);
  offset += 1;
  const dataMimeType = buffer.toString(
    "ascii",
    offset,
    offset + dataMimeTypeLength
  );
  offset += dataMimeTypeLength;

  const frame: SetupFrame = {
    data: null,
    dataMimeType,
    flags,
    keepAlive,
    lifetime,
    majorVersion,
    metadata: null,
    metadataMimeType,
    minorVersion,
    resumeToken,
    // streamId,
    streamId: 0,
    type: FrameTypes.SETUP,
  };
  readPayload(buffer, frame, offset);
  return frame;
}

/**
 * Writes an ERROR frame into a new buffer and returns it.
 *
 * Prefix size is for the error code (uint32 = 4).
 */
const ERROR_FIXED_SIZE = 4;
function serializeErrorFrame(frame: ErrorFrame): Buffer {
  const messageLength =
    frame.message != null ? Buffer.byteLength(frame.message, "utf8") : 0;
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE + ERROR_FIXED_SIZE + messageLength
  );
  let offset = writeHeader(frame, buffer);
  offset = buffer.writeUInt32BE(frame.code, offset);
  if (frame.message != null) {
    buffer.write(frame.message, offset, offset + messageLength, "utf8");
  }
  return buffer;
}

function sizeOfErrorFrame(frame: ErrorFrame): number {
  const messageLength =
    frame.message != null ? Buffer.byteLength(frame.message, "utf8") : 0;
  return FRAME_HEADER_SIZE + ERROR_FIXED_SIZE + messageLength;
}

/**
 * Reads an ERROR frame from the buffer and returns it.
 */
function deserializeErrorFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): ErrorFrame {
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const code = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   code >= 0 && code <= MAX_CODE,
  //   "RSocketBinaryFraming: Invalid ERROR frame, expected code to be >= 0 and <= %s. Got `%s`.",
  //   MAX_CODE,
  //   code
  // );
  const messageLength = buffer.length - offset;
  let message = "";
  if (messageLength > 0) {
    message = buffer.toString("utf8", offset, offset + messageLength);
    offset += messageLength;
  }

  return {
    code,
    flags,
    message,
    streamId,
    type: FrameTypes.ERROR,
  };
}

/**
 * Writes a KEEPALIVE frame into a new buffer and returns it.
 *
 * Prefix size is for the last received position (uint64 = 8).
 */
const KEEPALIVE_FIXED_SIZE = 8;
function serializeKeepAliveFrame(frame: KeepAliveFrame): Buffer {
  const dataLength = frame.data != null ? frame.data.byteLength : 0;
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE + KEEPALIVE_FIXED_SIZE + dataLength
  );
  let offset = writeHeader(frame, buffer);
  offset = writeUInt64BE(buffer, frame.lastReceivedPosition, offset);
  if (frame.data != null) {
    frame.data.copy(buffer, offset);
  }
  return buffer;
}

function sizeOfKeepAliveFrame(frame: KeepAliveFrame): number {
  const dataLength = frame.data != null ? frame.data.byteLength : 0;
  return FRAME_HEADER_SIZE + KEEPALIVE_FIXED_SIZE + dataLength;
}

/**
 * Reads a KEEPALIVE frame from the buffer and returns it.
 */
function deserializeKeepAliveFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): KeepAliveFrame {
  // invariant(
  //   streamId === 0,
  //   "RSocketBinaryFraming: Invalid KEEPALIVE frame, expected stream id to be 0."
  // );
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const lastReceivedPosition = readUInt64BE(buffer, offset);
  offset += 8;
  let data = null;
  if (offset < buffer.length) {
    data = buffer.slice(offset, buffer.length);
  }

  return {
    data,
    flags,
    lastReceivedPosition,
    // streamId,
    streamId: 0,
    type: FrameTypes.KEEPALIVE,
  };
}

/**
 * Writes a LEASE frame into a new buffer and returns it.
 *
 * Prefix size is for the ttl (uint32) and requestcount (uint32).
 */
const LEASE_FIXED_SIZE = 8;
function serializeLeaseFrame(frame: LeaseFrame): Buffer {
  const metaLength = frame.metadata != null ? frame.metadata.byteLength : 0;
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE + LEASE_FIXED_SIZE + metaLength
  );
  let offset = writeHeader(frame, buffer);
  offset = buffer.writeUInt32BE(frame.ttl, offset);
  offset = buffer.writeUInt32BE(frame.requestCount, offset);
  if (frame.metadata != null) {
    frame.metadata.copy(buffer, offset);
  }
  return buffer;
}

function sizeOfLeaseFrame(frame: LeaseFrame): number {
  const metaLength = frame.metadata != null ? frame.metadata.byteLength : 0;
  return FRAME_HEADER_SIZE + LEASE_FIXED_SIZE + metaLength;
}

/**
 * Reads a LEASE frame from the buffer and returns it.
 */
function deserializeLeaseFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): LeaseFrame {
  // invariant(
  //   streamId === 0,
  //   "RSocketBinaryFraming: Invalid LEASE frame, expected stream id to be 0."
  // );
  // const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const ttl = buffer.readUInt32BE(offset);
  offset += 4;
  const requestCount = buffer.readUInt32BE(offset);
  offset += 4;
  let metadata = null;
  if (offset < buffer.length) {
    metadata = buffer.slice(offset, buffer.length);
  }
  return {
    flags,
    metadata,
    requestCount,
    // streamId,
    streamId: 0,
    ttl,
    type: FrameTypes.LEASE,
  };
}

/**
 * Writes a REQUEST_FNF or REQUEST_RESPONSE frame to a new buffer and returns
 * it.
 *
 * Note that these frames have the same shape and only differ in their type.
 */
function serializeRequestFrame(
  frame: RequestFnfFrame | RequestResponseFrame
): Buffer {
  const payloadLength = getPayloadLength(frame);
  const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadLength);
  const offset = writeHeader(frame, buffer);
  writePayload(frame, buffer, offset);
  return buffer;
}

function sizeOfRequestFrame(
  frame: RequestFnfFrame | RequestResponseFrame
): number {
  const payloadLength = getPayloadLength(frame);
  return FRAME_HEADER_SIZE + payloadLength;
}

/**
 * Writes a METADATA_PUSH frame to a new buffer and returns
 * it.
 */
function serializeMetadataPushFrame(frame: MetadataPushFrame): Buffer {
  const metadata = frame.metadata;
  if (metadata != null) {
    const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + metadata.byteLength);
    const offset = writeHeader(frame, buffer);
    metadata.copy(buffer, offset);
    return buffer;
  } else {
    const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE);
    writeHeader(frame, buffer);
    return buffer;
  }
}

function sizeOfMetadataPushFrame(frame: MetadataPushFrame): number {
  return (
    FRAME_HEADER_SIZE + (frame.metadata != null ? frame.metadata.byteLength : 0)
  );
}

function deserializeRequestFnfFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): RequestFnfFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_FNF frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  const frame: RequestFnfFrame = {
    data: null,
    flags,
    // length,
    metadata: null,
    streamId,
    type: FrameTypes.REQUEST_FNF,
  };
  readPayload(buffer, frame, FRAME_HEADER_SIZE);
  return frame;
}

function deserializeRequestResponseFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): RequestResponseFrame {
  // invariant(
  // streamId > 0,
  // "RSocketBinaryFraming: Invalid REQUEST_RESPONSE frame, expected stream id to be > 0."
  // );
  // const length = buffer.length;
  const frame: RequestResponseFrame = {
    data: null,
    flags,
    // length,
    metadata: null,
    streamId,
    type: FrameTypes.REQUEST_RESPONSE,
  };
  readPayload(buffer, frame, FRAME_HEADER_SIZE);
  return frame;
}

function deserializeMetadataPushFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): MetadataPushFrame {
  // invariant(
  //   streamId === 0,
  //   "RSocketBinaryFraming: Invalid METADATA_PUSH frame, expected stream id to be 0."
  // );
  // const length = buffer.length;
  return {
    flags,
    // length,
    metadata:
      length === FRAME_HEADER_SIZE
        ? null
        : buffer.slice(FRAME_HEADER_SIZE, length),
    // streamId,
    streamId: 0,
    type: FrameTypes.METADATA_PUSH,
  };
}

/**
 * Writes a REQUEST_STREAM or REQUEST_CHANNEL frame to a new buffer and returns
 * it.
 *
 * Note that these frames have the same shape and only differ in their type.
 *
 * Prefix size is for requestN (uint32 = 4).
 */
const REQUEST_MANY_HEADER = 4;
function serializeRequestManyFrame(
  frame: RequestStreamFrame | RequestChannelFrame
): Buffer {
  const payloadLength = getPayloadLength(frame);
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE + REQUEST_MANY_HEADER + payloadLength
  );
  let offset = writeHeader(frame, buffer);
  offset = buffer.writeUInt32BE(frame.requestN, offset);
  writePayload(frame, buffer, offset);
  return buffer;
}

function sizeOfRequestManyFrame(
  frame: RequestStreamFrame | RequestChannelFrame
): number {
  const payloadLength = getPayloadLength(frame);
  return FRAME_HEADER_SIZE + REQUEST_MANY_HEADER + payloadLength;
}

function deserializeRequestStreamFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): RequestStreamFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const requestN = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   requestN > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
  //   requestN
  // );
  const frame: RequestStreamFrame = {
    data: null,
    flags,
    // length,
    metadata: null,
    requestN,
    streamId,
    type: FrameTypes.REQUEST_STREAM,
  };
  readPayload(buffer, frame, offset);
  return frame;
}

function deserializeRequestChannelFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): RequestChannelFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_CHANNEL frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const requestN = buffer.readInt32BE(offset);
  offset += 4;
  // invariant(
  //   requestN > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
  //   requestN
  // );
  const frame: RequestChannelFrame = {
    data: null,
    flags,
    // length,
    metadata: null,
    requestN,
    streamId,
    type: FrameTypes.REQUEST_CHANNEL,
  };
  readPayload(buffer, frame, offset);
  return frame;
}

/**
 * Writes a REQUEST_N frame to a new buffer and returns it.
 *
 * Prefix size is for requestN (uint32 = 4).
 */
const REQUEST_N_HEADER = 4;
function serializeRequestNFrame(frame: RequestNFrame): Buffer {
  const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + REQUEST_N_HEADER);
  const offset = writeHeader(frame, buffer);
  buffer.writeUInt32BE(frame.requestN, offset);
  return buffer;
}

function sizeOfRequestNFrame(frame: RequestNFrame): number {
  return FRAME_HEADER_SIZE + REQUEST_N_HEADER;
}

function deserializeRequestNFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): RequestNFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_N frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  const requestN = buffer.readInt32BE(FRAME_HEADER_SIZE);
  // invariant(
  //   requestN > 0,
  //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
  //   requestN
  // );
  return {
    flags,
    // length,
    requestN,
    streamId,
    type: FrameTypes.REQUEST_N,
  };
}

/**
 * Writes a CANCEL frame to a new buffer and returns it.
 */
function serializeCancelFrame(frame: CancelFrame): Buffer {
  const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE);
  writeHeader(frame, buffer);
  return buffer;
}

function sizeOfCancelFrame(frame: CancelFrame): number {
  return FRAME_HEADER_SIZE;
}

function deserializeCancelFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): CancelFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid CANCEL frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  return {
    flags,
    // length,
    streamId,
    type: FrameTypes.CANCEL,
  };
}

/**
 * Writes a PAYLOAD frame to a new buffer and returns it.
 */
function serializePayloadFrame(frame: PayloadFrame): Buffer {
  const payloadLength = getPayloadLength(frame);
  const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadLength);
  const offset = writeHeader(frame, buffer);
  writePayload(frame, buffer, offset);
  return buffer;
}

function sizeOfPayloadFrame(frame: PayloadFrame): number {
  const payloadLength = getPayloadLength(frame);
  return FRAME_HEADER_SIZE + payloadLength;
}

function deserializePayloadFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): PayloadFrame {
  // invariant(
  //   streamId > 0,
  //   "RSocketBinaryFraming: Invalid PAYLOAD frame, expected stream id to be > 0."
  // );
  const length = buffer.length;
  const frame: PayloadFrame = {
    data: null,
    flags,
    // length,
    metadata: null,
    streamId,
    type: FrameTypes.PAYLOAD,
  };
  readPayload(buffer, frame, FRAME_HEADER_SIZE);
  return frame;
}

/**
 * Writes a RESUME frame into a new buffer and returns it.
 *
 * Fixed size is:
 * - major version (uint16 = 2)
 * - minor version (uint16 = 2)
 * - token length (uint16 = 2)
 * - client position (uint64 = 8)
 * - server position (uint64 = 8)
 */
const RESUME_FIXED_SIZE = 22;
function serializeResumeFrame(frame: ResumeFrame): Buffer {
  const resumeTokenLength = frame.resumeToken.byteLength;
  const buffer = Buffer.allocUnsafe(
    FRAME_HEADER_SIZE + RESUME_FIXED_SIZE + resumeTokenLength
  );
  let offset = writeHeader(frame, buffer);
  offset = buffer.writeUInt16BE(frame.majorVersion, offset);
  offset = buffer.writeUInt16BE(frame.minorVersion, offset);
  offset = buffer.writeUInt16BE(resumeTokenLength, offset);
  offset += frame.resumeToken.copy(buffer, offset);
  offset = writeUInt64BE(buffer, frame.serverPosition, offset);
  writeUInt64BE(buffer, frame.clientPosition, offset);
  return buffer;
}

function sizeOfResumeFrame(frame: ResumeFrame): number {
  const resumeTokenLength = frame.resumeToken.byteLength;
  return FRAME_HEADER_SIZE + RESUME_FIXED_SIZE + resumeTokenLength;
}

function deserializeResumeFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): ResumeFrame {
  // invariant(
  //   streamId === 0,
  //   "RSocketBinaryFraming: Invalid RESUME frame, expected stream id to be 0."
  // );
  const length = buffer.length;
  let offset = FRAME_HEADER_SIZE;
  const majorVersion = buffer.readUInt16BE(offset);
  offset += 2;
  const minorVersion = buffer.readUInt16BE(offset);
  offset += 2;

  const resumeTokenLength = buffer.readInt16BE(offset);
  offset += 2;
  // invariant(
  //   resumeTokenLength >= 0 && resumeTokenLength <= MAX_RESUME_LENGTH,
  //   "RSocketBinaryFraming: Invalid SETUP frame, expected resumeToken length " +
  //     "to be >= 0 and <= %s. Got `%s`.",
  //   MAX_RESUME_LENGTH,
  //   resumeTokenLength
  // );
  const resumeToken = buffer.slice(offset, offset + resumeTokenLength);
  offset += resumeTokenLength;
  const serverPosition = readUInt64BE(buffer, offset);
  offset += 8;
  const clientPosition = readUInt64BE(buffer, offset);
  offset += 8;
  return {
    clientPosition,
    flags,
    // length,
    majorVersion,
    minorVersion,
    resumeToken,
    serverPosition,
    // streamId,
    streamId: 0,
    type: FrameTypes.RESUME,
  };
}

/**
 * Writes a RESUME_OK frame into a new buffer and returns it.
 *
 * Fixed size is:
 * - client position (uint64 = 8)
 */
const RESUME_OK_FIXED_SIZE = 8;
function serializeResumeOkFrame(frame: ResumeOkFrame): Buffer {
  const buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + RESUME_OK_FIXED_SIZE);
  const offset = writeHeader(frame, buffer);
  writeUInt64BE(buffer, frame.clientPosition, offset);
  return buffer;
}

function sizeOfResumeOkFrame(frame: ResumeOkFrame): number {
  return FRAME_HEADER_SIZE + RESUME_OK_FIXED_SIZE;
}

function deserializeResumeOkFrame(
  buffer: Buffer,
  streamId: number,
  flags: number
): ResumeOkFrame {
  // invariant(
  //   streamId === 0,
  //   "RSocketBinaryFraming: Invalid RESUME frame, expected stream id to be 0."
  // );
  const length = buffer.length;
  const clientPosition = readUInt64BE(buffer, FRAME_HEADER_SIZE);
  return {
    clientPosition,
    flags,
    // length,
    // streamId,
    streamId: 0,
    type: FrameTypes.RESUME_OK,
  };
}

/**
 * Write the header of the frame into the buffer.
 */
function writeHeader(frame: Frame, buffer: Buffer): number {
  const offset = buffer.writeInt32BE(frame.streamId, 0);
  // shift frame to high 6 bits, extract lowest 10 bits from flags
  return buffer.writeUInt16BE(
    (frame.type << FRAME_TYPE_OFFFSET) | (frame.flags & FLAGS_MASK),
    offset
  );
}

/**
 * Determine the length of the payload section of a frame. Only applies to
 * frame types that MAY have both metadata and data.
 */
function getPayloadLength(frame: FrameWithPayload): number {
  let payloadLength = 0;
  if (frame.data != null) {
    payloadLength += frame.data.byteLength;
  }
  if (Flags.hasMetadata(frame.flags)) {
    payloadLength += UINT24_SIZE;
    if (frame.metadata != null) {
      payloadLength += frame.metadata.byteLength;
    }
  }
  return payloadLength;
}

/**
 * Write the payload of a frame into the given buffer. Only applies to frame
 * types that MAY have both metadata and data.
 */
function writePayload(
  frame: FrameWithPayload,
  buffer: Buffer,
  offset: number
): void {
  if (Flags.hasMetadata(frame.flags)) {
    if (frame.metadata != null) {
      const metaLength = frame.metadata.byteLength;
      offset = writeUInt24BE(buffer, metaLength, offset);
      offset += frame.metadata.copy(buffer, offset);
    } else {
      offset = writeUInt24BE(buffer, 0, offset);
    }
  }
  if (frame.data != null) {
    frame.data.copy(buffer, offset);
  }
}

/**
 * Read the payload from a buffer and write it into the frame. Only applies to
 * frame types that MAY have both metadata and data.
 */
function readPayload(
  buffer: Buffer,
  frame: FrameWithPayload,
  offset: number
): void {
  if (Flags.hasMetadata(frame.flags)) {
    const metaLength = readUInt24BE(buffer, offset);
    offset += UINT24_SIZE;
    if (metaLength > 0) {
      frame.metadata = buffer.slice(offset, offset + metaLength);
      offset += metaLength;
    }
  }
  if (offset < buffer.length) {
    frame.data = buffer.slice(offset, buffer.length);
  }
}

// exported as class to facilitate testing
export class Deserializer {
  /**
   * Given a buffer that may contain zero or more length-prefixed frames followed
   * by zero or more bytes of a (partial) subsequent frame, returns an array of
   * the frames and a int representing the buffer offset.
   */
  deserializeFrames(buffer: Buffer): Generator<[Frame, number]> {
    return deserializeFrames(buffer);
  }

  /**
   * Reads a frame from a buffer that is prefixed with the frame length.
   */
  deserializeFrameWithLength(buffer: Buffer): Frame {
    return deserializeFrameWithLength(buffer);
  }

  /**
   * Read a frame from the buffer.
   */
  deserializeFrame(buffer: Buffer): Frame {
    return deserializeFrame(buffer);
  }
}
