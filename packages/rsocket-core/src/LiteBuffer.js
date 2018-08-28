'use strict';
// @flow

import invariant from 'fbjs/lib/invariant';

import type {RSocketBuffer} from 'rsocket-types';

let MAX_ARGUMENTS_LENGTH = 0x1000;

function blitBuffer(
  src: number[],
  dst: Uint8Array,
  offset: number,
  length: number,
) {
  for (var i = 0; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}

function utf8Write(
  buf: Uint8Array,
  input: string,
  offset: number,
  length: number,
) {
  return blitBuffer(
    utf8ToBytes(input, buf.length - offset),
    buf,
    offset,
    length,
  );
}

function decodeCodePointsArray(codePoints) {
  let len = codePoints.length;
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

function checkOffset(offset, ext, length) {
  if (offset % 1 !== 0 || offset < 0)
    throw new RangeError('offset is not uint');
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length');
}

function checkInt(buf: Uint8Array, value, offset, ext, max, min) {
  if (value > max || value < min) {
    throw new RangeError('"value" argument is out of bounds');
  }
  if (offset + ext > buf.length) {
    throw new RangeError('Index out of range');
  }
}

export default class LiteImpl implements RSocketBuffer {
  _buffer: Uint8Array;
  +length: number;

  constructor(buffer: Uint8Array) {
    this._buffer = buffer;
    this.length = buffer.length;
  }

  static create(length: number): LiteImpl {
    return new LiteImpl(new Uint8Array(length));
  }

  static from(value: any, encodingOrOffset: any, length: any): RSocketBuffer {
    if (ArrayBuffer.isView(value)) {
      return LiteImpl.fromArrayLike(value);
    } else if (Array.isArray(value)) {
      return new LiteImpl(Uint8Array.from(value));
    }

    if (value == null) {
      throw TypeError(
        'The first argument must be one of type, Buffer, ArrayBuffer, Array, ' +
          'or Array-like Object. Received type ' +
          typeof value,
      );
    }

    if (typeof value === 'string') {
      return new LiteImpl(Uint8Array.from(utf8ToBytes(value)));
    }

    if (
      isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))
    ) {
      return LiteImpl.fromArrayBuffer(value, encodingOrOffset, length);
    }

    if (typeof value === 'number') {
      throw new TypeError(
        'The "value" argument must not be of type number. Received type number',
      );
    }

    let valueOf = value.valueOf && value.valueOf();
    if (valueOf != null && valueOf !== value) {
      return LiteImpl.from(valueOf, encodingOrOffset, length);
    }

    throw new TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, ' +
        'Array, or Array-like Object. Received type ' +
        typeof value,
    );
  }

  static fromArrayLike(array: any): RSocketBuffer {
    let length = array.length | 0;
    let buf = LiteImpl.create(length);
    for (let i = 0; i < length; i += 1) {
      buf._buffer[i] = array[i] & 255;
    }
    return buf;
  }

  static fromArrayBuffer(
    array: any,
    byteOffset: number,
    length: number,
  ): RSocketBuffer {
    return new LiteImpl(new Uint8Array(array, byteOffset, length));
  }

  internalBuffer(): Uint8Array {
    return this._buffer;
  }

  write(input: string, offset: number, length: number, encoding: 'utf8') {
    switch (encoding) {
      case 'utf8':
        return utf8Write(this._buffer, input, offset, length);
      default:
        throw new TypeError('Unknown encoding: ' + encoding);
    }
  }

  slice(start: number, end: number): RSocketBuffer {
    let newBuf = this._buffer.subarray(start, end);
    return new LiteImpl(newBuf);
  }

  readUInt8(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 1, this._buffer.length);
    return this._buffer[offset];
  }

  readUInt16BE(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 2, this._buffer.length);
    return this._buffer[offset] << 8 | this._buffer[offset + 1];
  }

  readUInt32BE(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 4, this._buffer.length);

    return this._buffer[offset] * 0x1000000 +
      (this._buffer[offset + 1] << 16 |
        this._buffer[offset + 2] << 8 |
        this._buffer[offset + 3]);
  }

  readInt8(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 1, this._buffer.length);
    if (!(this._buffer[offset] & 0x80)) return this._buffer[offset];
    return (0xff - this._buffer[offset] + 1) * -1;
  }

  readInt16BE(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 2, this._buffer.length);
    let val = this._buffer[offset + 1] | this._buffer[offset] << 8;
    return val & 0x8000 ? val | 0xffff0000 : val;
  }

  readInt32BE(offset: number) {
    offset = offset >>> 0;
    if (__DEV__) checkOffset(offset, 4, this._buffer.length);

    return this._buffer[offset] << 24 |
      this._buffer[offset + 1] << 16 |
      this._buffer[offset + 2] << 8 |
      this._buffer[offset + 3];
  }

  writeUInt8(value: number, offset: number) {
    value = +value;
    offset = offset >>> 0;
    if (__DEV__) checkInt(this._buffer, value, offset, 1, 0xff, 0);
    this._buffer[offset] = value & 0xff;
    return offset + 1;
  }

  writeUInt16BE(value: number, offset: number) {
    value = +value;
    offset = offset >>> 0;
    if (__DEV__) checkInt(this._buffer, value, offset, 2, 0xffff, 0);
    this._buffer[offset] = value >>> 8;
    this._buffer[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeUInt32BE(value: number, offset: number) {
    value = +value;
    offset = offset >>> 0;
    if (__DEV__) checkInt(this._buffer, value, offset, 4, 0xffffffff, 0);
    this._buffer[offset] = value >>> 24;
    this._buffer[offset + 1] = value >>> 16;
    this._buffer[offset + 2] = value >>> 8;
    this._buffer[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeInt16BE(value: number, offset: number) {
    value = +value;
    offset = offset >>> 0;
    if (__DEV__) checkInt(this._buffer, value, offset, 2, 0x7fff, -0x8000);
    this._buffer[offset] = value >>> 8;
    this._buffer[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeInt32BE(value: number, offset: number) {
    value = +value;
    offset = offset >>> 0;
    if (__DEV__)
      checkInt(this._buffer, value, offset, 4, 0x7fffffff, -0x80000000);
    if (value < 0) value = 0xffffffff + value + 1;
    this._buffer[offset] = value >>> 24;
    this._buffer[offset + 1] = value >>> 16;
    this._buffer[offset + 2] = value >>> 8;
    this._buffer[offset + 3] = value & 0xff;
    return offset + 4;
  }

  toString(encoding?: string, start?: number, end?: number): string {
    let length = this._buffer.length;
    if (length === 0) return '';

    if (start === undefined || start < 0) {
      start = 0;
    }

    if (start > this._buffer.length) {
      return '';
    }

    if (end === undefined || end > this._buffer.length) {
      end = this._buffer.length;
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

    if (!encoding) encoding = 'utf8';

    switch (encoding) {
      case 'utf8':
        return utf8Slice(this._buffer, start, end);
      default:
        throw new TypeError('Unsupported encoding: ' + encoding);
    }
  }

  static byteLength(string: string | RSocketBuffer, encoding: string): number {
    if (string instanceof LiteImpl) {
      return string.length;
    }
    if (typeof string !== 'string') {
      throw new TypeError(
        'The "string" argument must be one of type string, Buffer, or ' +
          'ArrayBuffer. Received type ' +
          typeof string,
      );
    }

    switch (encoding) {
      case 'utf8':
        return utf8ToBytes(string).length;
      default:
        throw new TypeError('Unknown encoding: ' + encoding);
    }
  }

  copy(
    targetHolder: LiteImpl,
    targetStart?: number,
    start?: number,
    end?: number,
  ) {
    const source = this._buffer;
    const target = targetHolder._buffer;
    if (!start) start = 0;
    if (!end && end !== 0) end = source.length;
    if (!targetStart) targetStart = 0;
    if (targetStart >= target.length) targetStart = target.length;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0;
    if (target.length === 0 || source.length === 0) return 0;

    invariant(targetStart >= 0, 'targetStart out of bounds');
    invariant(start >= 0 && start < source.length, 'Index out of range');
    invariant(end >= 0, 'end out of bounds');

    // Are we oob?
    if (end > source.length) end = source.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    let len = end - start;

    if (
      source === target && typeof Uint8Array.prototype.copyWithin === 'function'
    ) {
      // Use built-in when available, missing from IE11
      source.copyWithin(targetStart, start, end);
    } else if (source === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (let i = len - 1; i >= 0; --i) {
        target[i + targetStart] = source[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        source.subarray(start, end),
        targetStart,
      );
    }

    return len;
  }
}

function utf8ToBytes(str: string, pUnits: number = Infinity) {
  let units = pUnits;
  let codePoint;
  let length = str.length;
  let leadSurrogate = null;
  let bytes = [];

  for (let i = 0; i < length; ++i) {
    codePoint = str.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xd7ff && codePoint < 0xe000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xdbff) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;

        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xdc00) {
        if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xd800 << 10 | codePoint - 0xdc00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xef, 0xbf, 0xbd);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break;
      bytes.push(codePoint >> 0x6 | 0xc0, codePoint & 0x3f | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break;
      bytes.push(
        codePoint >> 0xc | 0xe0,
        codePoint >> 0x6 & 0x3f | 0x80,
        codePoint & 0x3f | 0x80,
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break;
      bytes.push(
        codePoint >> 0x12 | 0xf0,
        codePoint >> 0xc & 0x3f | 0x80,
        codePoint >> 0x6 & 0x3f | 0x80,
        codePoint & 0x3f | 0x80,
      );
    } else {
      throw new Error('Invalid code point');
    }
  }

  return bytes;
}

function utf8Slice(buf: Uint8Array, start: number, end: number) {
  end = Math.min(buf.length, end);
  let res = [];

  let i = start;
  while (i < end) {
    let firstByte = buf[i];
    let codePoint = null;
    let bytesPerSequence = firstByte > 0xef
      ? 4
      : firstByte > 0xdf ? 3 : firstByte > 0xbf ? 2 : 1;

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
            tempCodePoint = (firstByte & 0x1f) << 0x6 | secondByte & 0x3f;
            if (tempCodePoint > 0x7f) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xc0) === 0x80 && (thirdByte & 0xc0) === 0x80) {
            tempCodePoint = (firstByte & 0xf) << 0xc |
              (secondByte & 0x3f) << 0x6 |
              thirdByte & 0x3f;
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
            tempCodePoint = (firstByte & 0xf) << 0x12 |
              (secondByte & 0x3f) << 0xc |
              (thirdByte & 0x3f) << 0x6 |
              fourthByte & 0x3f;
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
      res.push(codePoint >>> 10 & 0x3ff | 0xd800);
      codePoint = 0xdc00 | codePoint & 0x3ff;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res);
}

function isInstance(obj, type) {
  return obj instanceof type ||
    (obj != null &&
      obj.constructor != null &&
      obj.constructor.name != null &&
      obj.constructor.name === type.name);
}
