import { readUInt24BE, writeUInt24BE } from "@rsocket/rsocket-core";
import { WellKnownMimeType } from "./WellKnownMimeType";

export class CompositeMetadata implements Iterable<Entry> {
  _buffer: Buffer;

  constructor(buffer: Buffer) {
    this._buffer = buffer;
  }

  iterator(): Iterator<Entry> {
    return decodeCompositeMetadata(this._buffer);
  }

  [Symbol.iterator](): Iterator<Entry> {
    return decodeCompositeMetadata(this._buffer);
  }
}

export function encodeCompositeMetadata(
  metadata:
    | Map<string | WellKnownMimeType | number, Buffer | (() => Buffer)>
    | Array<[string | WellKnownMimeType | number, Buffer | (() => Buffer)]>
): Buffer {
  let encodedCompositeMetadata = Buffer.allocUnsafe(0);
  for (const [metadataKey, metadataValue] of metadata) {
    const metadataRealValue =
      typeof metadataValue === "function" ? metadataValue() : metadataValue;

    if (
      metadataKey instanceof WellKnownMimeType ||
      typeof metadataKey === "number" ||
      metadataKey.constructor.name === "WellKnownMimeType"
    ) {
      encodedCompositeMetadata = encodeAndAddWellKnownMetadata(
        encodedCompositeMetadata,
        metadataKey as WellKnownMimeType | number,
        metadataRealValue
      );
    } else {
      encodedCompositeMetadata = encodeAndAddCustomMetadata(
        encodedCompositeMetadata,
        metadataKey,
        metadataRealValue
      );
    }
  }

  return encodedCompositeMetadata;
}

// see #encodeMetadataHeader(ByteBufAllocator, String, int)
export function encodeAndAddCustomMetadata(
  compositeMetaData: Buffer,
  customMimeType: string,
  metadata: Buffer
): Buffer {
  return Buffer.concat([
    compositeMetaData,
    encodeCustomMetadataHeader(customMimeType, metadata.byteLength),
    metadata,
  ]);
}

// see #encodeMetadataHeader(ByteBufAllocator, byte, int)
export function encodeAndAddWellKnownMetadata(
  compositeMetadata: Buffer,
  knownMimeType: WellKnownMimeType | number,
  metadata: Buffer
): Buffer {
  let mimeTypeId: number;

  if (Number.isInteger(knownMimeType)) {
    mimeTypeId = knownMimeType as number;
  } else {
    mimeTypeId = (knownMimeType as WellKnownMimeType).identifier;
  }

  return Buffer.concat([
    compositeMetadata,
    encodeWellKnownMetadataHeader(mimeTypeId, metadata.byteLength),
    metadata,
  ]);
}

export function decodeMimeAndContentBuffersSlices(
  compositeMetadata: Buffer,
  entryIndex: number
): Buffer[] {
  const mimeIdOrLength: number = compositeMetadata.readInt8(entryIndex);
  let mime: Buffer;
  let toSkip = entryIndex;
  if (
    (mimeIdOrLength & STREAM_METADATA_KNOWN_MASK) ===
    STREAM_METADATA_KNOWN_MASK
  ) {
    mime = compositeMetadata.slice(toSkip, toSkip + 1);
    toSkip += 1;
  } else {
    // M flag unset, remaining 7 bits are the length of the mime
    const mimeLength = (mimeIdOrLength & 0xff) + 1;

    if (compositeMetadata.byteLength > toSkip + mimeLength) {
      // need to be able to read an extra mimeLength bytes (we have already read one so byteLength should be strictly more)
      // here we need a way for the returned ByteBuf to differentiate between a
      // 1-byte length mime type and a 1 byte encoded mime id, preferably without
      // re-applying the byte mask. The easiest way is to include the initial byte
      // and have further decoding ignore the first byte. 1 byte buffer == id, 2+ byte
      // buffer == full mime string.
      mime = compositeMetadata.slice(toSkip, toSkip + mimeLength + 1);

      // we thus need to skip the bytes we just sliced, but not the flag/length byte
      // which was already skipped in initial read
      toSkip += mimeLength + 1;
    } else {
      throw new Error(
        "Metadata is malformed. Inappropriately formed Mime Length"
      );
    }
  }

  if (compositeMetadata.byteLength >= toSkip + 3) {
    // ensures the length medium can be read
    const metadataLength = readUInt24BE(compositeMetadata, toSkip);
    toSkip += 3;
    if (compositeMetadata.byteLength >= metadataLength + toSkip) {
      const metadata = compositeMetadata.slice(toSkip, toSkip + metadataLength);
      return [mime, metadata];
    } else {
      throw new Error(
        "Metadata is malformed. Inappropriately formed Metadata Length or malformed content"
      );
    }
  } else {
    throw new Error(
      "Metadata is malformed. Metadata Length is absent or malformed"
    );
  }
}

export function decodeMimeTypeFromMimeBuffer(
  flyweightMimeBuffer: Buffer
): string {
  if (flyweightMimeBuffer.length < 2) {
    throw new Error("Unable to decode explicit MIME type");
  }
  // the encoded length is assumed to be kept at the start of the buffer
  // but also assumed to be irrelevant because the rest of the slice length
  // actually already matches _decoded_length
  return flyweightMimeBuffer.toString("ascii", 1);
}

export function encodeCustomMetadataHeader(
  customMime: string,
  metadataLength: number
): Buffer {
  const metadataHeader: Buffer = Buffer.allocUnsafe(4 + customMime.length);
  // reserve 1 byte for the customMime length
  // /!\ careful not to read that first byte, which is random at this point
  // int writerIndexInitial = metadataHeader.writerIndex();
  // metadataHeader.writerIndex(writerIndexInitial + 1);

  // write the custom mime in UTF8 but validate it is all ASCII-compatible
  // (which produces the right result since ASCII chars are still encoded on 1 byte in UTF8)
  const customMimeLength: number = metadataHeader.write(customMime, 1);
  if (!isAscii(metadataHeader, 1)) {
    throw new Error("Custom mime type must be US_ASCII characters only");
  }
  if (customMimeLength < 1 || customMimeLength > 128) {
    throw new Error(
      "Custom mime type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128"
    );
  }
  // encoded length is one less than actual length, since 0 is never a valid length, which gives
  // wider representation range
  metadataHeader.writeUInt8(customMimeLength - 1);

  writeUInt24BE(metadataHeader, metadataLength, customMimeLength + 1);

  return metadataHeader;
}

export function encodeWellKnownMetadataHeader(
  mimeType: number,
  metadataLength: number
): Buffer {
  const buffer: Buffer = Buffer.allocUnsafe(4);

  buffer.writeUInt8(mimeType | STREAM_METADATA_KNOWN_MASK);
  writeUInt24BE(buffer, metadataLength, 1);

  return buffer;
}

export function* decodeCompositeMetadata(
  buffer: Buffer
): Generator<Entry, void, any> {
  const length = buffer.byteLength;
  let entryIndex = 0;

  while (entryIndex < length) {
    const headerAndData = decodeMimeAndContentBuffersSlices(buffer, entryIndex);

    const header = headerAndData[0];
    const data = headerAndData[1];

    entryIndex = computeNextEntryIndex(entryIndex, header, data);

    if (!isWellKnownMimeType(header)) {
      const typeString = decodeMimeTypeFromMimeBuffer(header);
      if (!typeString) {
        throw new Error("MIME type cannot be null");
      }

      yield new ExplicitMimeTimeEntry(data, typeString);
      continue;
    }

    const id = decodeMimeIdFromMimeBuffer(header);
    const type = WellKnownMimeType.fromIdentifier(id);
    if (WellKnownMimeType.UNKNOWN_RESERVED_MIME_TYPE === type) {
      yield new ReservedMimeTypeEntry(data, id);
      continue;
    }

    yield new WellKnownMimeTypeEntry(data, type);
  }
}

export interface Entry {
  /**
   * Returns the un-decoded content of the {@link Entry}.
   *
   * @return the un-decoded content of the {@link Entry}
   */
  readonly content: Buffer;

  /**
   * Returns the MIME type of the entry, if it can be decoded.
   *
   * @return the MIME type of the entry, if it can be decoded, otherwise {@code null}.
   */
  readonly mimeType?: string;
}

export class ExplicitMimeTimeEntry implements Entry {
  constructor(readonly content: Buffer, readonly type: string) {}
}

export class ReservedMimeTypeEntry implements Entry {
  constructor(readonly content: Buffer, readonly type: number) {}

  /**
   * Since this entry represents a compressed id that couldn't be decoded, this is
   * always {@code null}.
   */
  get mimeType(): string {
    return undefined;
  }
}

export class WellKnownMimeTypeEntry implements Entry {
  constructor(readonly content: Buffer, readonly type: WellKnownMimeType) {}

  get mimeType(): string {
    return this.type.string;
  }
}

function decodeMimeIdFromMimeBuffer(mimeBuffer: Buffer): number {
  if (!isWellKnownMimeType(mimeBuffer)) {
    return WellKnownMimeType.UNPARSEABLE_MIME_TYPE.identifier;
  }
  return mimeBuffer.readInt8() & STREAM_METADATA_LENGTH_MASK;
}

function computeNextEntryIndex(
  currentEntryIndex: number,
  headerSlice: Buffer,
  contentSlice: Buffer
): number {
  return (
    currentEntryIndex +
    headerSlice.byteLength + // this includes the mime length byte
    3 + // 3 bytes of the content length, which are excluded from the slice
    contentSlice.byteLength
  );
}

function isWellKnownMimeType(header: Buffer): boolean {
  return header.byteLength === 1;
}

const STREAM_METADATA_KNOWN_MASK = 0x80; // 1000 0000
const STREAM_METADATA_LENGTH_MASK = 0x7f; // 0111 1111

function isAscii(buffer: Buffer, offset: number): boolean {
  let isAscii = true;
  for (let i = offset, length = buffer.length; i < length; i++) {
    if (buffer[i] > 127) {
      isAscii = false;
      break;
    }
  }

  return isAscii;
}
