/** Copyright (c) Facebook, Inc. and its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */


/**
 * This code is adapted from https://github.com/facebook/flow/blob/master/lib/node.js
 *
 * TODO joesavona: remove this file once Flow fixes buffer/events exports
 * See https://github.com/facebook/flow/issues/3723
 */

type buffer$NonBufferEncoding =
  'hex' | 'HEX' |
  'utf8' | 'UTF8' | 'utf-8' | 'UTF-8' |
  'ascii' | 'ASCII' |
  'binary' | 'BINARY' |
  'base64' | 'BASE64' |
  'ucs2' | 'UCS2' | 'ucs-2' | 'UCS-2' |
  'utf16le' | 'UTF16LE' | 'utf-16le' | 'UTF-16LE' | 'latin1';
type buffer$Encoding = buffer$NonBufferEncoding | 'buffer'
type buffer$ToJSONRet = { type: string, data: Array<number> }

declare class Buffer extends Uint8Array {
  constructor(
    value: Array<number> | number | string | Buffer | ArrayBuffer,
    encoding?: buffer$Encoding
  ): void;
  [i: number]: number;
  length: number;

  compare(otherBuffer: Buffer): number;
  copy(targetBuffer: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  entries(): Iterator<[number, number]>;
  equals(otherBuffer: Buffer): boolean;
  fill(value: string | number, offset?: number, end?: number, encoding?: string): this;
  fill(value: string, encoding?: string): this;
  includes(
    value: string | Buffer | number,
    offsetOrEncoding?: number | buffer$Encoding,
    encoding?: buffer$Encoding
  ): boolean;
  indexOf(
    value: string | Buffer | number,
    offsetOrEncoding?: number | buffer$Encoding,
    encoding?: buffer$Encoding
  ): number;
  inspect(): string;
  keys(): Iterator<number>,
  lastIndexOf(
    value: string | Buffer | number,
    offsetOrEncoding?: number | buffer$Encoding,
    encoding?: buffer$Encoding
  ): number;
  readDoubleBE(offset: number, noAssert?: boolean): number;
  readDoubleLE(offset: number, noAssert?: boolean): number;
  readFloatBE(offset: number, noAssert?: boolean): number;
  readFloatLE(offset: number, noAssert?: boolean): number;
  readInt16BE(offset: number, noAssert?: boolean): number;
  readInt16LE(offset: number, noAssert?: boolean): number;
  readInt32BE(offset: number, noAssert?: boolean): number;
  readInt32LE(offset: number, noAssert?: boolean): number;
  readInt8(offset: number, noAssert?: boolean): number;
  readIntBE(offset: number, byteLength: number, noAssert?: boolean): number;
  readIntLE(offset: number, byteLength: number, noAssert?: boolean): number;
  readUInt16BE(offset: number, noAssert?: boolean): number;
  readUInt16LE(offset: number, noAssert?: boolean): number;
  readUInt32BE(offset: number, noAssert?: boolean): number;
  readUInt32LE(offset: number, noAssert?: boolean): number;
  readUInt8(offset: number, noAssert?: boolean): number;
  readUIntBE(offset: number, byteLength: number, noAssert?: boolean): number;
  readUIntLE(offset: number, byteLength: number, noAssert?: boolean): number;
  slice(start?: number, end?: number): this;
  swap16(): Buffer;
  swap32(): Buffer;
  toJSON(): buffer$ToJSONRet;
  toString(encoding?: buffer$Encoding, start?: number, end?: number): string;
  values(): Iterator<number>;
  write(string: string, offset?: number, length?: number, encoding?: buffer$Encoding): void;
  writeDoubleBE(value: number, offset: number, noAssert?: boolean): number;
  writeDoubleLE(value: number, offset: number, noAssert?: boolean): number;
  writeFloatBE(value: number, offset: number, noAssert?: boolean): number;
  writeFloatLE(value: number, offset: number, noAssert?: boolean): number;
  writeInt16BE(value: number, offset: number, noAssert?: boolean): number;
  writeInt16LE(value: number, offset: number, noAssert?: boolean): number;
  writeInt32BE(value: number, offset: number, noAssert?: boolean): number;
  writeInt32LE(value: number, offset: number, noAssert?: boolean): number;
  writeInt8(value: number, offset: number, noAssert?: boolean): number;
  writeIntBE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
  writeIntLE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
  writeUInt16BE(value: number, offset: number, noAssert?: boolean): number;
  writeUInt16LE(value: number, offset: number, noAssert?: boolean): number;
  writeUInt32BE(value: number, offset: number, noAssert?: boolean): number;
  writeUInt32LE(value: number, offset: number, noAssert?: boolean): number;
  writeUInt8(value: number, offset: number, noAssert?: boolean): number;
  writeUIntBE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
  writeUIntLE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;

  static alloc(size: number, fill?: string | number, encoding?: buffer$Encoding): Buffer;
  static allocUnsafe(size: number): Buffer;
  static allocUnsafeSlow(size: number): Buffer;
  static byteLength(string: string | Buffer | $TypedArray | DataView | ArrayBuffer, encoding?: buffer$Encoding): number;
  static compare(buf1: Buffer, buf2: Buffer): number;
  static concat(list: Array<Buffer>, totalLength?: number): Buffer;

  static from(value: Buffer): Buffer;
  static from(value: string, encoding?: buffer$Encoding): Buffer;
  static from(value: ArrayBuffer, byteOffset?: number, length?: number): Buffer;
  static from(value: Iterable<number>): this;
  static isBuffer(obj: any): boolean;
  static isEncoding(encoding: string): boolean;
}

declare module "buffer" {
  declare export type Buffer = Buffer;
  declare var kMaxLength: number;
  declare var INSPECT_MAX_BYTES: number;
  declare function transcode(source: Buffer, fromEnc: buffer$Encoding, toEnc: buffer$Encoding): Buffer;
}
