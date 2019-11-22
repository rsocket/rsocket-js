'use strict';
// @flow

const K_MAX_LENGTH = 0x7fffffff;

function createBuffer(length): Buffer {
  if (length > K_MAX_LENGTH) {
    throw new RangeError(
      'The value "' + length + '" is invalid for option "size"',
    );
  }
  // Return an augmented `Uint8Array` instance
  const buf = new Uint8Array(length);
  // $FlowFixMe
  buf.__proto__ = Buffer.prototype;
  return buf;
}

const bufferExists = typeof global !== 'undefined' &&
  global.hasOwnProperty('Buffer');

export const LiteBuffer = bufferExists ? global.Buffer : Buffer;
export function Buffer(arg: any, encodingOrOffset?: number, length?: number) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number',
      );
    }
    return allocUnsafe(arg);
  }
  return from(arg, encodingOrOffset, length);
}

function from(value, encodingOrOffset, length): Buffer {
  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value);
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type, Buffer, ArrayBuffer, Array, ' +
        'or Array-like Object. Received type ' +
        typeof value,
    );
  }

  if (
    isInstance(value, ArrayBuffer) ||
    (value && isInstance(value.buffer, ArrayBuffer))
  ) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number',
    );
  }

  const valueOf = value.valueOf && value.valueOf();
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length);
  }

  const b = fromObject(value);
  if (b) {
    return b;
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, ' +
      'Array, or Array-like Object. Received type ' +
      typeof value,
  );
}

Buffer.from = function(value: any, encodingOrOffset?, length?): Buffer {
  return from(value, encodingOrOffset, length);
};

// $FlowFixMe
Buffer.prototype.__proto__ = Uint8Array.prototype;

// $FlowFixMe
Buffer.__proto__ = Uint8Array;

function assertSize(size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number');
  } else if (size < 0) {
    throw new RangeError(
      'The value "' + size + '" is invalid for option "size"',
    );
  }
}

function alloc(size, fill, encoding) {
  assertSize(size);

  return createBuffer(size);
}

Buffer.alloc = function(size, fill, encoding) {
  return alloc(size, fill, encoding);
};

function allocUnsafe(size) {
  assertSize(size);
  return createBuffer(size < 0 ? 0 : checked(size) | 0);
}

function fromArrayLike(array: any) {
  const length = array.length < 0 ? 0 : checked(array.length) | 0;
  const buf: Buffer = createBuffer(length);
  for (let i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255;
  }
  return buf;
}

function fromArrayBuffer(
  array: any,
  byteOffset?: number,
  length?: number,
): Buffer {
  let buf;
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array);
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset);
  } else {
    buf = new Uint8Array(array, byteOffset, length);
  }

  // $FlowFixMe
  buf.__proto__ = Buffer.prototype;
  return buf;
}

function fromObject(obj: Buffer) {
  if (Buffer.isBuffer(obj)) {
    const len = checked(obj.length) | 0;
    const buf: Buffer = createBuffer(len);

    if (buf.length === 0) {
      return buf;
    }

    obj.copy(buf, 0, 0, len);
    return buf;
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0);
    }
    return fromArrayLike(obj);
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data);
  }
}

function checked(length) {
  if (length >= K_MAX_LENGTH) {
    throw new RangeError(
      'Attempt to allocate Buffer larger than maximum ' +
        'size: 0x' +
        K_MAX_LENGTH.toString(16) +
        ' bytes',
    );
  }
  return length | 0;
}

Buffer.isBuffer = function isBuffer(b) {
  return b != null && b._isBuffer === true && b !== Buffer.prototype;
};

Buffer.isEncoding = function isEncoding(encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true;
    default:
      return false;
  }
};

Buffer.concat = function concat(list: Uint8Array[], length?: number): Buffer {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers');
  }

  if (list.length === 0) {
    return Buffer.alloc(0);
  }

  let i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  const buffer = Buffer.alloc(length);
  let pos = 0;
  for (i = 0; i < list.length; ++i) {
    let buf = list[i];
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf);
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

Buffer.prototype._isBuffer = true;

Buffer.prototype.includes = function includes(
  val: any,
  byteOffset: number,
  encoding: number,
) {
  return this.indexOf(val, byteOffset, encoding) !== -1;
};

function blitBuffer(
  src: number[],
  dst: number[],
  offset: number,
  length: number,
) {
  let i = 0;
  for (; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}

function utf8Write(
  buf: number[],
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

Buffer.prototype.write = function write(
  input: string,
  offset?: number,
  length?: number,
  encoding?: 'utf8',
) {
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
    // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0;
    if (length === undefined) {
      encoding = 'utf8';
      length = this.length;
    } else if (isFinite(length)) {
      length = length >>> 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = this.length;
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported',
    );
  }
  switch (encoding) {
    case 'utf8':
      return utf8Write(this, input, offset, length);
    default:
      throw new TypeError('Unknown encoding: ' + encoding);
  }
};

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

function asciiSlice(buf, start, end) {
  let ret = '';
  end = Math.min(buf.length, end);

  for (let i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7f);
  }
  return ret;
}

Buffer.prototype.slice = function slice(start: number, end: number) {
  const len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  const newBuf = this.subarray(start, end);
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype;
  return newBuf;
};

function checkOffset(offset, ext, length) {
  if (offset % 1 !== 0 || offset < 0)
    throw new RangeError('offset is not uint');
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length');
}

Buffer.prototype.readUInt8 = function readUInt8(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset];
};

Buffer.prototype.readUInt16BE = function readUInt16BE(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] << 8 | this[offset + 1];
};

Buffer.prototype.readUInt32BE = function readUInt32BE(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return this[offset] * 0x1000000 +
    (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
};

Buffer.prototype.readInt8 = function readInt8(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return this[offset];
  return (0xff - this[offset] + 1) * -1;
};

Buffer.prototype.readInt16BE = function readInt16BE(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  const val = this[offset + 1] | this[offset] << 8;
  return val & 0x8000 ? val | 0xffff0000 : val;
};

Buffer.prototype.readInt32BE = function readInt32BE(
  offset: number,
  noAssert: boolean,
) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);

  return this[offset] << 24 |
    this[offset + 1] << 16 |
    this[offset + 2] << 8 |
    this[offset + 3];
};

function checkInt(buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf))
    throw new TypeError('"buffer" argument must be a Buffer instance');
  if (value > max || value < min)
    throw new RangeError('"value" argument is out of bounds');
  if (offset + ext > buf.length) throw new RangeError('Index out of range');
}

Buffer.prototype.writeUInt8 = function writeUInt8(
  value: number,
  offset: number,
  noAssert: boolean,
) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  this[offset] = value & 0xff;
  return offset + 1;
};

Buffer.prototype.writeUInt16BE = function writeUInt16BE(
  value: number,
  offset: number,
  noAssert: boolean,
) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};

Buffer.prototype.writeUInt32BE = function writeUInt32BE(
  value: number,
  offset: number,
  noAssert: boolean,
) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};

Buffer.prototype.writeInt16BE = function writeInt16BE(
  value: number,
  offset: number,
  noAssert: boolean,
) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};

Buffer.prototype.writeInt32BE = function writeInt32BE(
  value: number,
  offset: number,
  noAssert: boolean,
) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};

// $FlowFixMe
Buffer.prototype.toString = function toString() {
  const length = this.length;
  if (length === 0) return '';
  return slowToString.apply(this, arguments);
};

function slowToString(encoding, start, end) {
  let loweredCase = false;

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

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end);
      default:
        if (loweredCase)
          throw new TypeError('Unsupported encoding: ' + encoding);
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}
function utf8ToBytes(str: string, pUnits: number = Infinity) {
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

function byteLength(string, encoding): number {
  if (Buffer.isBuffer(string)) {
    return string.length;
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength;
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ' +
        'ArrayBuffer. Received type ' +
        typeof string,
    );
  }

  const len = string.length;
  const mustMatch = arguments.length > 2 && arguments[2] === true;
  if (!mustMatch && len === 0) return 0;

  // Use a for loop to avoid recursion
  let loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length;

      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length; // assume utf8
        }
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
  throw new Error('Unexpected path in function');
}

Buffer.byteLength = byteLength;

function utf8Slice(buf, start, end) {
  end = Math.min(buf.length, end);
  const res = [];

  let i = start;
  while (i < end) {
    const firstByte = buf[i];
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

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy(
  target: Buffer,
  targetStart?: number,
  start?: number,
  end?: number,
) {
  if (!Buffer.isBuffer(target))
    throw new TypeError('argument should be a Buffer');
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length === 0 || this.length === 0) return 0;

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds');
  }
  if (start < 0 || start >= this.length)
    throw new RangeError('Index out of range');
  if (end < 0) throw new RangeError('sourceEnd out of bounds');

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  const len = end - start;

  if (
    this === target && typeof Uint8Array.prototype.copyWithin === 'function'
  ) {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end);
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (let i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart,
    );
  }

  return len;
};

function isInstance(obj, type) {
  return obj instanceof type ||
    (obj != null &&
      obj.constructor != null &&
      obj.constructor.name != null &&
      obj.constructor.name === type.name);
}
function numberIsNaN(obj) {
  // For IE11 support
  return obj !== obj; // eslint-disable-line no-self-compare
}
