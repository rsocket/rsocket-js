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
 */

'use strict';

import {
  byteLength,
  readUInt24BE,
  readUInt64BE,
  writeUInt24BE,
  writeUInt64BE,
} from '../RSocketBufferUtils';

describe('RSocketBufferUtils', () => {
  describe('byteLength', () => {
    it('returns string lengths', () => {
      expect(byteLength('hello', 'utf8')).toBe(5);
      // nihongo = the Japanese language
      expect(byteLength('\u65E5\u672C\u8A9E', 'utf8')).toBe(9);
    });

    it('returns buffer lengths', () => {
      expect(byteLength(new Buffer(42), 'buffer')).toBe(42);
    });

    it('returns zero for null', () => {
      expect(byteLength(null, 'utf8')).toBe(0);
    });
  });

  describe('{read,write}UInt24BE', () => {
    [
      0,
      1,
      Math.pow(2, 24) - 5,
      Math.pow(2, 24) - 3,
      Math.pow(2, 24) - 2,
      Math.pow(2, 24) - 1,
    ].forEach(val => {
      it('reads/writes 0x' + val.toString(16), () => {
        const buffer = new Buffer(3);
        const offset = writeUInt24BE(buffer, val, 0);
        expect(offset).toBe(3);
        expect(readUInt24BE(buffer, 0)).toBe(val);
      });
    });
  });

  describe('{read,write}UInt64BE', () => {
    [
      0,
      1,
      Math.pow(2, 31) - 1,
      Math.pow(2, 31),
      Math.pow(2, 32) - 1,
      Math.pow(2, 32),
      Math.pow(2, 33) - 1,
      Math.pow(2, 33),
      Math.pow(2, 34) - 1,
      Math.pow(2, 34),
      Number.MAX_SAFE_INTEGER - 4,
      Number.MAX_SAFE_INTEGER - 3,
      Number.MAX_SAFE_INTEGER - 2,
      Number.MAX_SAFE_INTEGER - 1,
      Number.MAX_SAFE_INTEGER,
    ].forEach(val => {
      it('writes and reads back 0x' + val.toString(16), () => {
        const buffer = new Buffer(8);
        const offset = writeUInt64BE(buffer, val, 0);
        expect(offset).toBe(8);
        expect(readUInt64BE(buffer, 0)).toBe(val);
      });
    });

    // Ensure that the binary representation is correct
    it('writes values in canonical form', () => {
      const buffer = new Buffer(8);
      buffer.fill(0);
      writeUInt64BE(buffer, Number.MAX_SAFE_INTEGER, 0);
      expect(buffer.toString('hex')).toBe('001fffffffffffff');
    });
  });
});
