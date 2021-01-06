'use strict';
// @flow

import {LiteBuffer as Buffer} from './LiteBuffer';
import {readUInt24BE, writeUInt24BE} from './RSocketBufferUtils';
import {createBuffer} from './RSocketBufferUtils';
import WellKnownMimeType, {
  UNKNOWN_RESERVED_MIME_TYPE,
  UNPARSEABLE_MIME_TYPE,
} from './WellKnownMimeType';

// $FlowFixMe
export class CompositeMetadata implements Iterable<Entry> {
  _buffer: Buffer;

  constructor(buffer: Buffer) {
    this._buffer = buffer;
  }

  iterator(): Iterator<Entry> {
    return decodeCompositeMetadata(this._buffer);
  }

  // $FlowFixMe
  [Symbol.iterator](): Iterator<Entry> {
    return decodeCompositeMetadata(this._buffer);
  }
}

/**
 * Encode an object where key is either {@link WellKnownMimeType} or {@link string}
 * and value as a {@link Buffer} into composite metadata {@link Buffer}
 *
 * @param metadata key-value based object
 * @returns {Buffer}
 */
export function encodeCompositeMetadata(
  metadata:
    | Map<string | WellKnownMimeType | number, Buffer | (() => Buffer)>
    | Array<[string | WellKnownMimeType | number, Buffer | (() => Buffer)]>,
): Buffer {
  let encodedCompositeMetadata = createBuffer(0);
  for (const [metadataKey, metadataValue] of metadata) {
    const metadataRealValue =
      typeof metadataValue === 'function' ? metadataValue() : metadataValue;

    if (
      metadataKey instanceof WellKnownMimeType ||
      typeof metadataKey === 'number' ||
      metadataKey.constructor.name === 'WellKnownMimeType'
    ) {
      encodedCompositeMetadata = encodeAndAddWellKnownMetadata(
        encodedCompositeMetadata,
        (metadataKey: any),
        metadataRealValue,
      );
    } else {
      encodedCompositeMetadata = encodeAndAddCustomMetadata(
        encodedCompositeMetadata,
        (metadataKey: any),
        metadataRealValue,
      );
    }
  }

  return encodedCompositeMetadata;
}

/**
 * Encode a new sub-metadata information into a composite metadata {@link CompositeByteBuf
 * buffer}, without checking if the {@link String} can be matched with a well known compressable
 * mime type. Prefer using this method and {@link #encodeAndAddMetadata(CompositeByteBuf,
 * ByteBufAllocator, WellKnownMimeType, ByteBuf)} if you know in advance whether or not the mime
 * is well known. Otherwise use {@link #encodeAndAddMetadataWithCompression(CompositeByteBuf,
 * ByteBufAllocator, String, ByteBuf)}
 *
 * @param compositeMetaData the buffer that will hold all composite metadata information.
 * @param allocator the {@link ByteBufAllocator} to use to create intermediate buffers as needed.
 * @param customMimeType the custom mime type to encode.
 * @param metadata the metadata value to encode.
 */
// see #encodeMetadataHeader(ByteBufAllocator, String, int)
export function encodeAndAddCustomMetadata(
  compositeMetaData: Buffer,
  customMimeType: string,
  metadata: Buffer,
): Buffer {
  return Buffer.concat(
    ([
      compositeMetaData,
      encodeCustomMetadataHeader(customMimeType, metadata.byteLength),
      metadata,
    ]: Buffer[]),
  );
}

/**
 * Encode a new sub-metadata information into a composite metadata {@link CompositeByteBuf
 * buffer}.
 *
 * @param compositeMetadata the buffer that will hold all composite metadata information.
 * @param allocator the {@link ByteBufAllocator} to use to create intermediate buffers as needed.
 * @param knownMimeType the {@link WellKnownMimeType} to encode.
 * @param metadata the metadata value to encode.
 */
// see #encodeMetadataHeader(ByteBufAllocator, byte, int)
export function encodeAndAddWellKnownMetadata(
  compositeMetadata: Buffer,
  knownMimeType: WellKnownMimeType | number,
  metadata: Buffer,
): Buffer {
  let mimeTypeId: number;

  if (Number.isInteger(knownMimeType)) {
    mimeTypeId = ((knownMimeType: any): number);
  } else {
    mimeTypeId = ((knownMimeType: any): WellKnownMimeType).identifier;
  }

  return Buffer.concat(
    ([
      compositeMetadata,
      encodeWellKnownMetadataHeader(mimeTypeId, metadata.byteLength),
      metadata,
    ]: Buffer[]),
  );
}

/**
 * Decode the next metadata entry (a mime header + content pair of {@link ByteBuf}) from   a {@link
 * ByteBuf} that contains at least enough bytes for one more such entry. These buffers are
 * actually slices of the full metadata buffer, and this method doesn't move the full metadata
 * buffer's {@link ByteBuf#readerIndex()}. As such, it requires the user to provide an {@code
 * index} to read from. The next index is computed by calling {@link #computeNextEntryIndex(int,
 * ByteBuf, ByteBuf)}. Size of the first buffer (the "header buffer") drives which decoding method
 * should be further applied to it.
 *
 * <p>The header buffer is either:
 *
 * <ul>
 *   <li>made up of a single byte: this represents an encoded mime id, which can be further
 *       decoded using {@link #decodeMimeIdFromMimeBuffer(ByteBuf)}
 *   <li>made up of 2 or more bytes: this represents an encoded mime String + its length, which
 *       can be further decoded using {@link #decodeMimeTypeFromMimeBuffer(ByteBuf)}. Note the
 *       encoded length, in the first byte, is skipped by this decoding method because the
 *       remaining length of the buffer is that of the mime string.
 * </ul>
 *
 * @param compositeMetadata the source {@link ByteBuf} that originally contains one or more
 *     metadata entries
 * @param entryIndex the {@link ByteBuf#readerIndex()} to start decoding from. original reader
 *     index is kept on the source buffer
 * @param retainSlices should produced metadata entry buffers {@link ByteBuf#slice() slices} be
 *     {@link ByteBuf#retainedSlice() retained}?
 * @return a {@link ByteBuf} array of length 2 containing the mime header buffer
 *     <strong>slice</strong> and the content buffer <strong>slice</strong>, or one of the
 *     zero-length error constant arrays
 */
export function decodeMimeAndContentBuffersSlices(
  compositeMetadata: Buffer,
  entryIndex: number,
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
        'Metadata is malformed. Inappropriately formed Mime Length',
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
        'Metadata is malformed. Inappropriately formed Metadata Length or malformed content',
      );
    }
  } else {
    throw new Error(
      'Metadata is malformed. Metadata Length is absent or malformed',
    );
  }
}

/**
 * Decode a {@link CharSequence} custome mime type from a {@link ByteBuf}, assuming said buffer
 * properly contains such a mime type.
 *
 * <p>The buffer must at least have two readable bytes, which distinguishes it from the {@link
 * #decodeMimeIdFromMimeBuffer(ByteBuf) compressed id} case. The first byte is a size and the
 * remaining bytes must correspond to the {@link CharSequence}, encoded fully in US_ASCII. As a
 * result, the first byte can simply be skipped, and the remaining of the buffer be decoded to the
 * mime type.
 *
 * <p>If the mime header buffer is less than 2 bytes long, returns {@code null}.
 *
 * @param flyweightMimeBuffer the mime header {@link ByteBuf} that contains length + custom mime
 *     type
 * @return the decoded custom mime type, as a {@link CharSequence}, or null if the input is
 *     invalid
 * @see #decodeMimeIdFromMimeBuffer(ByteBuf)
 */
export function decodeMimeTypeFromMimeBuffer(
  flyweightMimeBuffer: Buffer,
): string {
  if (flyweightMimeBuffer.length < 2) {
    throw new Error('Unable to decode explicit MIME type');
  }
  // the encoded length is assumed to be kept at the start of the buffer
  // but also assumed to be irrelevant because the rest of the slice length
  // actually already matches _decoded_length
  return flyweightMimeBuffer.toString('ascii', 1);
}

export function encodeCustomMetadataHeader(
  customMime: string,
  metadataLength: number,
): Buffer {
  const metadataHeader: Buffer = createBuffer(4 + customMime.length);
  // reserve 1 byte for the customMime length
  // /!\ careful not to read that first byte, which is random at this point
  // int writerIndexInitial = metadataHeader.writerIndex();
  // metadataHeader.writerIndex(writerIndexInitial + 1);

  // write the custom mime in UTF8 but validate it is all ASCII-compatible
  // (which produces the right result since ASCII chars are still encoded on 1 byte in UTF8)
  const customMimeLength: number = metadataHeader.write(customMime, 1);
  if (!isAscii(metadataHeader, 1)) {
    throw new Error('Custom mime type must be US_ASCII characters only');
  }
  if (customMimeLength < 1 || customMimeLength > 128) {
    throw new Error(
      'Custom mime type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128',
    );
  }
  // encoded length is one less than actual length, since 0 is never a valid length, which gives
  // wider representation range
  metadataHeader.writeUInt8(customMimeLength - 1);

  writeUInt24BE(metadataHeader, metadataLength, customMimeLength + 1);

  return metadataHeader;
}

/**
 * Encode a {@link WellKnownMimeType well known mime type} and a metadata value length into a
 * newly allocated {@link ByteBuf}.
 *
 * <p>This compact representation encodes the mime type via its ID on a single byte, and the
 * unsigned value length on 3 additional bytes.
 *
 * @param allocator the {@link ByteBufAllocator} to use to create the buffer.
 * @param mimeType a byte identifier of a {@link WellKnownMimeType} to encode.
 * @param metadataLength the metadata length to append to the buffer as an unsigned 24 bits
 *     integer.
 * @return the encoded mime and metadata length information
 */
export function encodeWellKnownMetadataHeader(
  mimeType: number,
  metadataLength: number,
): Buffer {
  const buffer: Buffer = Buffer.alloc(4);

  buffer.writeUInt8(mimeType | STREAM_METADATA_KNOWN_MASK);
  writeUInt24BE(buffer, metadataLength, 1);

  return buffer;
}

/**
 * Decode given {@link Buffer} into {@link Iterator<Entry>}
 *
 * @param buffer encoded Composite Metadata content
 * @returns {Iterator<Entry>}
 * @since 0.0.21
 */
export function* decodeCompositeMetadata(
  buffer: Buffer,
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
        throw new Error('MIME type cannot be null');
      }

      yield new ExplicitMimeTimeEntry(data, typeString);
      continue;
    }

    const id = decodeMimeIdFromMimeBuffer(header);
    const type = WellKnownMimeType.fromIdentifier(id);
    if (UNKNOWN_RESERVED_MIME_TYPE === type) {
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
  +content: Buffer,

  /**
   * Returns the MIME type of the entry, if it can be decoded.
   *
   * @return the MIME type of the entry, if it can be decoded, otherwise {@code null}.
   */
  +mimeType: ?string,
}

export class ExplicitMimeTimeEntry implements Entry {
  _content: Buffer;
  _type: string;

  constructor(content: Buffer, type: string) {
    this._content = content;
    this._type = type;
  }

  get content(): Buffer {
    return this._content;
  }

  get mimeType(): string {
    return this._type;
  }
}

export class ReservedMimeTypeEntry implements Entry {
  _content: Buffer;
  _type: number;

  constructor(content: Buffer, type: number) {
    this._content = content;
    this._type = type;
  }

  get content(): Buffer {
    return this._content;
  }

  /**
   * {@inheritDoc} Since this entry represents a compressed id that couldn't be decoded, this is
   * always {@code null}.
   */
  get mimeType(): ?string {
    return undefined;
  }

  /**
   * Returns the reserved, but unknown {@link WellKnownMimeType} for this entry. Range is 0-127
   * (inclusive).
   *
   * @return the reserved, but unknown {@link WellKnownMimeType} for this entry
   */
  get type(): number {
    return this._type;
  }
}

export class WellKnownMimeTypeEntry implements Entry {
  _content: Buffer;
  _type: WellKnownMimeType;

  constructor(content: Buffer, type: WellKnownMimeType) {
    this._content = content;
    this._type = type;
  }

  get content(): Buffer {
    return this._content;
  }

  get mimeType(): string {
    return this._type.string;
  }

  /**
   * Returns the {@link WellKnownMimeType} for this entry.
   *
   * @return the {@link WellKnownMimeType} for this entry
   */
  get type(): WellKnownMimeType {
    return this._type;
  }
}

/**
 * Decode a {@code byte} compressed mime id from a {@link ByteBuf}, assuming said buffer properly
 * contains such an id.
 *
 * <p>The buffer must have exactly one readable byte, which is assumed to have been tested for
 * mime id encoding via the {@link #STREAM_METADATA_KNOWN_MASK} mask ({@code firstByte &
 * STREAM_METADATA_KNOWN_MASK) == STREAM_METADATA_KNOWN_MASK}).
 *
 * <p>If there is no readable byte, the negative identifier of {@link
 * WellKnownMimeType#UNPARSEABLE_MIME_TYPE} is returned.
 *
 * @param mimeBuffer the buffer that should next contain the compressed mime id byte
 * @return the compressed mime id, between 0 and 127, or a negative id if the input is invalid
 * @see #decodeMimeTypeFromMimeBuffer(ByteBuf)
 */
function decodeMimeIdFromMimeBuffer(mimeBuffer: Buffer): number {
  if (!isWellKnownMimeType(mimeBuffer)) {
    return UNPARSEABLE_MIME_TYPE.identifier;
  }
  return mimeBuffer.readInt8() & STREAM_METADATA_LENGTH_MASK;
}

function computeNextEntryIndex(
  currentEntryIndex: number,
  headerSlice: Buffer,
  contentSlice: Buffer,
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
