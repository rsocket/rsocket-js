/* eslint-disable no-bitwise */

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
 */

/**
 * Writes a uint24 to a buffer starting at the given offset, returning the
 * offset of the next byte.
 */
export function writeUInt24BE(
  buffer: Buffer,
  value: number,
  offset: number
): number {
  // eslint-disable-next-line no-param-reassign
  offset = buffer.writeUInt8(value >>> 16, offset); // 3rd byte
  // eslint-disable-next-line no-param-reassign
  offset = buffer.writeUInt8((value >>> 8) & 0xff, offset); // 2nd byte
  return buffer.writeUInt8(value & 0xff, offset); // 1st byte
}
