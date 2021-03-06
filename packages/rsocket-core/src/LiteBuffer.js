'use strict';
// @flow

import type {Buffer as NodeBuffer} from 'buffer';
import ExistingBufferModule from 'buffer';

const hasGlobalBuffer =
  typeof global !== 'undefined' && global.hasOwnProperty('Buffer');
const hasBufferModule = ExistingBufferModule.hasOwnProperty('Buffer');

function notImplemented(msg?: string): void {
  const message = msg ? `Not implemented: ${msg}` : 'Not implemented';
  throw new Error(message);
}

// eslint-disable-next-line max-len
// Taken from: https://github.com/nodejs/node/blob/ba684805b6c0eded76e5cd89ee00328ac7a59365/lib/internal/util.js#L125
// Return undefined if there is no match.
// Move the "slow cases" to a separate function to make sure this function gets
// inlined properly. That prioritizes the common case.
function normalizeEncoding(enc: string | null): ?string {
  if (enc == null || enc === 'utf8' || enc === 'utf-8') {
    return 'utf8';
  }
  return slowCases(enc);
}

function isInstance(obj, type) {
  return (
    obj instanceof type ||
    (obj != null &&
      obj.constructor != null &&
      obj.constructor.name != null &&
      obj.constructor.name === type.name)
  );
}

// eslint-disable-next-line max-len
// https://github.com/nodejs/node/blob/ba684805b6c0eded76e5cd89ee00328ac7a59365/lib/internal/util.js#L130
function slowCases(enc: string): ?string {
  switch (enc.length) {
    case 4:
      if (enc === 'UTF8') {
        return 'utf8';
      }
      if (enc === 'ucs2' || enc === 'UCS2') {
        return 'utf16le';
      }
      enc = `${enc}`.toLowerCase();
      if (enc === 'utf8') {
        return 'utf8';
      }
      if (enc === 'ucs2') {
        return 'utf16le';
      }
      break;
    case 3:
      if (enc === 'hex' || enc === 'HEX' || `${enc}`.toLowerCase() === 'hex') {
        return 'hex';
      }
      break;
    case 5:
      if (enc === 'ascii') {
        return 'ascii';
      }
      if (enc === 'ucs-2') {
        return 'utf16le';
      }
      if (enc === 'UTF-8') {
        return 'utf8';
      }
      if (enc === 'ASCII') {
        return 'ascii';
      }
      if (enc === 'UCS-2') {
        return 'utf16le';
      }
      enc = `${enc}`.toLowerCase();
      if (enc === 'utf-8') {
        return 'utf8';
      }
      if (enc === 'ascii') {
        return 'ascii';
      }
      if (enc === 'ucs-2') {
        return 'utf16le';
      }
      break;
    case 6:
      if (enc === 'base64') {
        return 'base64';
      }
      if (enc === 'latin1' || enc === 'binary') {
        return 'latin1';
      }
      if (enc === 'BASE64') {
        return 'base64';
      }
      if (enc === 'LATIN1' || enc === 'BINARY') {
        return 'latin1';
      }
      enc = `${enc}`.toLowerCase();
      if (enc === 'base64') {
        return 'base64';
      }
      if (enc === 'latin1' || enc === 'binary') {
        return 'latin1';
      }
      break;
    case 7:
      if (
        enc === 'utf16le' ||
        enc === 'UTF16LE' ||
        `${enc}`.toLowerCase() === 'utf16le'
      ) {
        return 'utf16le';
      }
      break;
    case 8:
      if (
        enc === 'utf-16le' ||
        enc === 'UTF-16LE' ||
        `${enc}`.toLowerCase() === 'utf-16le'
      ) {
        return 'utf16le';
      }
      break;
    default:
      if (enc === '') {
        return 'utf8';
      }
  }
}

const notImplementedEncodings = [
  'base64',
  'hex',
  'ascii',
  'binary',
  'latin1',
  'ucs2',
  'utf16le',
];

function checkEncoding(encoding = 'utf8', strict = true): string {
  if (typeof encoding !== 'string' || (strict && encoding === '')) {
    if (!strict) {
      return 'utf8';
    }
    throw new TypeError(`Unknown encoding: ${encoding}`);
  }

  const normalized = normalizeEncoding(encoding);

  if (normalized === undefined) {
    throw new TypeError(`Unknown encoding: ${encoding}`);
  }

  if (notImplementedEncodings.includes(encoding)) {
    notImplemented(`"${encoding}" encoding`);
  }

  return ((normalized: any): string);
}

interface EncodingOp {
  byteLength(string: string): number,
}

// https://github.com/nodejs/node/blob/56dbe466fdbc598baea3bfce289bf52b97b8b8f7/lib/buffer.js#L598
const encodingOps: {[key: string]: EncodingOp} = {
  ascii: {
    byteLength: (string: string): number => string.length,
  },
  base64: {
    byteLength: (string: string): number =>
      base64ByteLength(string, string.length),
  },
  hex: {
    byteLength: (string: string): number => string.length >>> 1,
  },
  latin1: {
    byteLength: (string: string): number => string.length,
  },
  ucs2: {
    byteLength: (string: string): number => string.length * 2,
  },
  utf16le: {
    byteLength: (string: string): number => string.length * 2,
  },
  utf8: {
    byteLength: (string: string): number => utf8ToBytes(string).length,
  },
};

function base64ByteLength(str: string, bytes: number): number {
  // Handle padding
  if (str.charCodeAt(bytes - 1) === 0x3d) {
    bytes--;
  }
  if (bytes > 1 && str.charCodeAt(bytes - 1) === 0x3d) {
    bytes--;
  }

  // Base64 ratio: 3/4
  // eslint-disable-next-line no-bitwise
  return (bytes * 3) >>> 2;
}

const MAX_ARGUMENTS_LENGTH = 0x1000;
function decodeCodePointsArray(codePoints) {
  const len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints); // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  let res = '';
  let i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, (i += MAX_ARGUMENTS_LENGTH)),
    );
  }
  return res;
}

function utf8ToBytes(str: string, pUnits: number = Infinity): number[] {
  let units = pUnits;
  let codePoint;
  const length = str.length;
  let leadSurrogate = null;
  const bytes = [];

  for (let i = 0; i < length; ++i) {
    codePoint = str.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xd7ff && codePoint < 0xe000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xdbff) {
          // unexpected trail
          if ((units -= 3) > -1) {
            bytes.push(0xef, 0xbf, 0xbd);
          }
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) {
            bytes.push(0xef, 0xbf, 0xbd);
          }
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;

        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xdc00) {
        if ((units -= 3) > -1) {
          bytes.push(0xef, 0xbf, 0xbd);
        }
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint =
        (((leadSurrogate - 0xd800) << 10) | (codePoint - 0xdc00)) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) {
        bytes.push(0xef, 0xbf, 0xbd);
      }
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) {
        break;
      }
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) {
        break;
      }
      bytes.push((codePoint >> 0x6) | 0xc0, (codePoint & 0x3f) | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) {
        break;
      }
      bytes.push(
        (codePoint >> 0xc) | 0xe0,
        ((codePoint >> 0x6) & 0x3f) | 0x80,
        (codePoint & 0x3f) | 0x80,
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) {
        break;
      }
      bytes.push(
        (codePoint >> 0x12) | 0xf0,
        ((codePoint >> 0xc) & 0x3f) | 0x80,
        ((codePoint >> 0x6) & 0x3f) | 0x80,
        (codePoint & 0x3f) | 0x80,
      );
    } else {
      throw new Error('Invalid code point');
    }
  }

  return bytes;
}

function utf8Slice(buf: Buffer, start: number, end: number) {
  end = Math.min(buf.length, end);
  const res = [];

  let i = start;
  while (i < end) {
    const firstByte = buf[i];
    let codePoint = null;
    let bytesPerSequence =
      firstByte > 0xef ? 4 : firstByte > 0xdf ? 3 : firstByte > 0xbf ? 2 : 1;

    if (i + bytesPerSequence <= end) {
      let secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break;
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xc0) === 0x80) {
            tempCodePoint = ((firstByte & 0x1f) << 0x6) | (secondByte & 0x3f);
            if (tempCodePoint > 0x7f) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xc0) === 0x80 && (thirdByte & 0xc0) === 0x80) {
            tempCodePoint =
              ((firstByte & 0xf) << 0xc) |
              ((secondByte & 0x3f) << 0x6) |
              (thirdByte & 0x3f);
            if (
              tempCodePoint > 0x7ff &&
              (tempCodePoint < 0xd800 || tempCodePoint > 0xdfff)
            ) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if (
            (secondByte & 0xc0) === 0x80 &&
            (thirdByte & 0xc0) === 0x80 &&
            (fourthByte & 0xc0) === 0x80
          ) {
            tempCodePoint =
              ((firstByte & 0xf) << 0x12) |
              ((secondByte & 0x3f) << 0xc) |
              ((thirdByte & 0x3f) << 0x6) |
              (fourthByte & 0x3f);
            if (tempCodePoint > 0xffff && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xfffd;
      bytesPerSequence = 1;
    } else if (codePoint > 0xffff) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(((codePoint >>> 10) & 0x3ff) | 0xd800);
      codePoint = 0xdc00 | (codePoint & 0x3ff);
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res);
}

function utf8Write(
  buf: Buffer,
  input: string,
  offset: number,
  length: number,
): number {
  return blitBuffer(
    utf8ToBytes(input, buf.length - offset),
    buf,
    offset,
    length,
  );
}

function blitBuffer(
  src: number[],
  dst: Buffer,
  offset: number,
  length: number,
): number {
  let i: number = 0;
  for (; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) {
      break;
    }
    dst[i + offset] = src[i];
  }
  return i;
}

/**
 * See also https://nodejs.org/api/buffer.html
 */
export class Buffer extends Uint8Array {
  constructor(
    value: number | Buffer | $TypedArray | ArrayBuffer | number[],
    byteOffset?: number,
    length?: number,
  ) {
    if (typeof value == 'number') {
      super(value);
    } else {
      const offset = byteOffset || 0;
      const realLength =
        //$FlowFixMe
        length || (isInstance(value, Array) ? value.length : value.byteLength);
      super((value: any), offset, realLength);
    }
  }
  /**
   * Allocates a new Buffer of size bytes.
   */
  static alloc(
    size: number,
    fill: number | string | Uint8Array | Buffer = 0,
    encoding: string = 'utf8',
  ): Buffer {
    if (typeof size !== 'number') {
      throw new TypeError(
        `The "size" argument must be of type number. Received type ${typeof size}`,
      );
    }

    const buf = new Buffer(size);
    if (size === 0) {
      return buf;
    }

    let bufFill;
    if (typeof fill === 'string') {
      encoding = checkEncoding(encoding);
      if (fill.length === 1 && encoding === 'utf8') {
        buf.fill(fill.charCodeAt(0));
      } else {
        bufFill = Buffer.from(fill, encoding);
      }
    } else if (typeof fill === 'number') {
      buf.fill(fill);
    } else if (isInstance(fill, Uint8Array)) {
      if (fill.length === 0) {
        throw new TypeError(
          `The argument "value" is invalid. Received ${fill.constructor.name} []`,
        );
      }

      bufFill = fill;
    }

    if (bufFill) {
      if (bufFill.length > buf.length) {
        bufFill = bufFill.subarray(0, buf.length);
      }

      let offset = 0;
      while (offset < size) {
        buf.set(bufFill, offset);
        offset += bufFill.length;
        if (offset + bufFill.length >= size) {
          break;
        }
      }
      if (offset !== size) {
        buf.set(bufFill.subarray(0, size - offset), offset);
      }
    }

    return buf;
  }

  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }

  /**
   * Returns the byte length of a string when encoded. This is not the same as
   * String.prototype.length, which does not account for the encoding that is
   * used to convert the string into bytes.
   */
  static byteLength(
    string: string | Buffer | ArrayBuffer,
    encoding: string = 'utf8',
  ): number {
    if (typeof string != 'string') {
      return string.byteLength;
    }

    encoding = normalizeEncoding(encoding) || 'utf8';
    return encodingOps[encoding].byteLength(string);
  }

  /**
   * Returns a new Buffer which is the result of concatenating all the Buffer
   * instances in the list together.
   */
  static concat(list: Buffer[] | Uint8Array[], totalLength?: number): Buffer {
    if (totalLength == undefined) {
      totalLength = 0;
      for (const buf of list) {
        totalLength += buf.length;
      }
    }

    const buffer = new Buffer(totalLength);
    let pos = 0;
    for (const buf of list) {
      buffer.set(buf, pos);
      pos += buf.length;
    }

    return buffer;
  }

  /**
   * This creates a view of the ArrayBuffer without copying the underlying
   * memory. For example, when passed a reference to the .buffer property of a
   * TypedArray instance, the newly created Buffer will share the same allocated
   * memory as the TypedArray.
   */
  //$FlowFixMe
  static from(
    value: string | Buffer | $TypedArray | ArrayBuffer | number[],
    byteOffsetOrEncoding?: number | string,
    //$FlowFixMe
    length?: number,
    //$FlowFixMe
  ): Buffer {
    const offset =
      typeof byteOffsetOrEncoding === 'string'
        ? undefined
        : byteOffsetOrEncoding;
    let encoding =
      typeof byteOffsetOrEncoding === 'string'
        ? byteOffsetOrEncoding
        : undefined;

    if (typeof value === 'string' || value.constructor.name === 'String') {
      value = value.toString();
      encoding = checkEncoding(encoding, false);
      // if (encoding === 'hex') {return new Buffer(hex.decodeString(value).buffer);}
      // if (encoding === 'base64') {return new Buffer(base64.decode(value));}

      switch (encoding) {
        case 'utf8':
          if (typeof TextEncoder !== 'undefined') {
            return new Buffer(new TextEncoder().encode(value).buffer);
          }
          return new Buffer(utf8ToBytes(value));
        default:
          throw new TypeError('Unknown encoding: ' + encoding);
      }
    }

    // workaround for https://github.com/microsoft/TypeScript/issues/38446
    return new Buffer(value, offset, length);
  }

  /**
   * Returns true if obj is a Buffer, false otherwise.
   */
  static isBuffer(obj: any): boolean {
    return (
      isInstance(obj, Buffer) ||
      (!hasGlobalBuffer && hasBufferModule && isInstance(obj, Uint8Array))
    );
  }

  static isEncoding(encoding: any): boolean {
    return (
      typeof encoding === 'string' &&
      encoding.length !== 0 &&
      normalizeEncoding(encoding) !== undefined
    );
  }

  /**
   * Copies data from a region of buf to a region in target, even if the target
   * memory region overlaps with buf.
   */
  copy(
    targetBuffer: Buffer | Uint8Array,
    targetStart: number = 0,
    sourceStart: number = 0,
    sourceEnd: number = this.length,
  ): number {
    const sourceBuffer = this.subarray(sourceStart, sourceEnd);
    targetBuffer.set(sourceBuffer, targetStart);
    return sourceBuffer.length;
  }

  /*
   * Returns true if both buf and otherBuffer have exactly the same bytes, false otherwise.
   */
  equals(otherBuffer: Uint8Array | Buffer): boolean {
    if (!isInstance(otherBuffer, Uint8Array)) {
      throw new TypeError(
        // eslint-disable-next-line max-len
        `The "otherBuffer" argument must be an instance of Buffer or Uint8Array. Received type ${typeof otherBuffer}`,
      );
    }

    if (this === otherBuffer) {
      return true;
    }
    if (this.byteLength !== otherBuffer.byteLength) {
      return false;
    }

    for (let i = 0; i < this.length; i++) {
      if (this[i] !== otherBuffer[i]) {
        return false;
      }
    }

    return true;
  }

  readDoubleBE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getFloat64(offset);
  }

  readDoubleLE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getFloat64(offset, true);
  }

  readFloatBE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getFloat32(offset);
  }

  readFloatLE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getFloat32(offset, true);
  }

  readInt8(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt8(
      offset,
    );
  }

  readInt16BE(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt16(
      offset,
    );
  }

  readInt16LE(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt16(
      offset,
      true,
    );
  }

  readInt32BE(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt32(
      offset,
    );
  }

  readInt32LE(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getInt32(
      offset,
      true,
    );
  }

  readUInt8(offset: number = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint8(
      offset,
    );
  }

  readUInt16BE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getUint16(offset);
  }

  readUInt16LE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getUint16(offset, true);
  }

  readUInt32BE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getUint32(offset);
  }

  readUInt32LE(offset: number = 0): number {
    return new DataView(
      this.buffer,
      this.byteOffset,
      this.byteLength,
    ).getUint32(offset, true);
  }

  /**
   * Returns a new Buffer that references the same memory as the original, but
   * offset and cropped by the start and end indices.
   */
  // $FlowFixMe
  slice(begin: number = 0, end: number = this.length): Buffer {
    // workaround for https://github.com/microsoft/TypeScript/issues/38665
    return this.subarray(begin, end);
  }

  // $FlowFixMe
  subarray(begin: number = 0, end: number = this.length): Buffer {
    return new Buffer(super.subarray(begin, end));
  }

  /**
   * Returns a JSON representation of buf. JSON.stringify() implicitly calls
   * this function when stringifying a Buffer instance.
   */
  toJSON(): any {
    return {data: Array.from(this), type: 'Buffer'};
  }

  /**
   * Decodes buf to a string according to the specified character encoding in
   * encoding. start and end may be passed to decode only a subset of buf.
   */
  toString(
    encoding: string = 'utf8',
    start: number = 0,
    end: number = this.length,
  ): string {
    encoding = checkEncoding(encoding);

    if (typeof TextDecoder !== 'undefined') {
      const b = this.subarray(start, end);
      // if (encoding === 'hex') {return hex.encodeToString(b);}
      // if (encoding === 'base64') {return base64.encode(b.buffer);}

      return new TextDecoder().decode(b);
    }

    return this.slowToString(encoding, start, end);
  }

  slowToString(
    encoding: string = 'utf8',
    start: number = 0,
    end: number = this.length,
  ): string {
    if (start === undefined || start < 0) {
      start = 0;
    }

    if (start > this.length) {
      return '';
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return '';
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return '';
    }

    encoding = checkEncoding(encoding);
    switch (encoding) {
      case 'utf8':
        return utf8Slice(this, start, end);
      default:
        throw new TypeError('Unsupported encoding: ' + encoding);
    }
  }

  /**
   * Writes string to buf at offset according to the character encoding in
   * encoding. The length parameter is the number of bytes to write. If buf did
   * not contain enough space to fit the entire string, only part of string will
   * be written. However, partially encoded characters will not be written.
   */
  write(
    string: string,
    offset: number = 0,
    length: number = this.length,
    encoding: string = 'utf8',
  ): number {
    encoding = checkEncoding(encoding);
    switch (encoding) {
      case 'utf8':
        if (typeof TextEncoder !== 'undefined') {
          // $FlowFixMe
          const resultArray = new TextEncoder().encode(string);
          this.set(resultArray, offset);

          return resultArray.byteLength > length - offset
            ? length - offset
            : resultArray.byteLength;
        }
        return utf8Write(this, string, offset, length);
      default:
        throw new TypeError('Unknown encoding: ' + encoding);
    }
  }

  writeDoubleBE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setFloat64(
      offset,
      value,
    );
    return offset + 8;
  }

  writeDoubleLE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setFloat64(
      offset,
      value,
      true,
    );
    return offset + 8;
  }

  writeFloatBE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setFloat32(
      offset,
      value,
    );
    return offset + 4;
  }

  writeFloatLE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setFloat32(
      offset,
      value,
      true,
    );
    return offset + 4;
  }

  writeInt8(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setInt8(
      offset,
      value,
    );
    return offset + 1;
  }

  writeInt16BE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setInt16(
      offset,
      value,
    );
    return offset + 2;
  }

  writeInt16LE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setInt16(
      offset,
      value,
      true,
    );
    return offset + 2;
  }

  writeInt32BE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(
      offset,
      value,
    );
    return offset + 4;
  }

  writeInt32LE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setInt32(
      offset,
      value,
      true,
    );
    return offset + 4;
  }

  writeUInt8(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint8(
      offset,
      value,
    );
    return offset + 1;
  }

  writeUInt16BE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint16(
      offset,
      value,
    );
    return offset + 2;
  }

  writeUInt16LE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint16(
      offset,
      value,
      true,
    );
    return offset + 2;
  }

  writeUInt32BE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(
      offset,
      value,
    );
    return offset + 4;
  }

  writeUInt32LE(value: number, offset: number = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setUint32(
      offset,
      value,
      true,
    );
    return offset + 4;
  }
}

if (!hasGlobalBuffer) {
  if (hasBufferModule) {
    // ExistingBuffer is likely to be a polyfill, hence we can override it
    // eslint-disable-next-line no-undef
    // $FlowFixMe
    Object.defineProperty(ExistingBufferModule, 'Buffer', {
      configurable: true,
      enumerable: false,
      value: Buffer,
      writable: true,
    });
  }
  // eslint-disable-next-line no-undef
  Object.defineProperty(window, 'Buffer', {
    configurable: true,
    enumerable: false,
    value: Buffer,
    writable: true,
  });
}

export const LiteBuffer: NodeBuffer = hasGlobalBuffer ? global.Buffer : Buffer;
