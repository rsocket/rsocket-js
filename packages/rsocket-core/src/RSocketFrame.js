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
'use strict';

/* eslint-disable max-len, no-bitwise */

import type {ErrorFrame, Frame} from 'rsocket-types';

export const CONNECTION_STREAM_ID = 0;

export const FRAME_TYPES = {
  CANCEL: 0x09, // Cancel Request: Cancel outstanding request.
  ERROR: 0x0b, // Error: Error at connection or application level.
  EXT: 0x3f, // Extension Header: Used To Extend more frame types as well as extensions.
  KEEPALIVE: 0x03, // Keepalive: Connection keepalive.
  LEASE: 0x02, // Lease: Sent by Responder to grant the ability to send requests.
  METADATA_PUSH: 0x0c, // Metadata: Asynchronous Metadata frame
  PAYLOAD: 0x0a, // Payload: Payload on a stream. For example, response to a request, or message on a channel.
  REQUEST_CHANNEL: 0x07, // Request Channel: Request a completable stream in both directions.
  REQUEST_FNF: 0x05, // Fire And Forget: A single one-way message.
  REQUEST_N: 0x08, // Request N: Request N more items with Reactive Streams semantics.
  REQUEST_RESPONSE: 0x04, // Request Response: Request single response.
  REQUEST_STREAM: 0x06, // Request Stream: Request a completable stream.
  RESERVED: 0x00, // Reserved
  RESUME: 0x0d, // Resume: Replaces SETUP for Resuming Operation (optional)
  RESUME_OK: 0x0e, // Resume OK : Sent in response to a RESUME if resuming operation possible (optional)
  SETUP: 0x01, // Setup: Sent by client to initiate protocol processing.
};

// Maps frame type codes to type names
export const FRAME_TYPE_NAMES: {[typeCode: number]: string} = {};
for (const name in FRAME_TYPES) {
  const value = FRAME_TYPES[name];
  FRAME_TYPE_NAMES[value] = name;
}

export const FLAGS = {
  COMPLETE: 0x40, // PAYLOAD, REQUEST_CHANNEL: indicates stream completion, if set onComplete will be invoked on receiver.
  FOLLOWS: 0x80, // PAYLOAD, REQUEST_XXX: indicates that frame was fragmented and requires reassembly
  IGNORE: 0x200, // (all): Ignore frame if not understood.
  LEASE: 0x40, // SETUP: Will honor lease or not.
  METADATA: 0x100, // (all): must be set if metadata is present in the frame.
  NEXT: 0x20, // PAYLOAD: indicates data/metadata present, if set onNext will be invoked on receiver.
  RESPOND: 0x80, // KEEPALIVE: should KEEPALIVE be sent by peer on receipt.
  RESUME_ENABLE: 0x80, // SETUP: Client requests resume capability if possible. Resume Identification Token present.
};

// Maps error names to codes
export const ERROR_CODES = {
  APPLICATION_ERROR: 0x00000201,
  CANCELED: 0x00000203,
  CONNECTION_CLOSE: 0x00000102,
  CONNECTION_ERROR: 0x00000101,
  INVALID: 0x00000204,
  INVALID_SETUP: 0x00000001,
  REJECTED: 0x00000202,
  REJECTED_RESUME: 0x00000004,
  REJECTED_SETUP: 0x00000003,
  RESERVED: 0x00000000,
  RESERVED_EXTENSION: 0xffffffff,
  UNSUPPORTED_SETUP: 0x00000002,
};

// Maps error codes to names
export const ERROR_EXPLANATIONS: {[code: number]: string} = {};
for (const explanation in ERROR_CODES) {
  const code = ERROR_CODES[explanation];
  ERROR_EXPLANATIONS[code] = explanation;
}

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

/**
 * Returns true iff the flags have the IGNORE bit set.
 */
export function isIgnore(flags: number): boolean {
  return (flags & FLAGS.IGNORE) === FLAGS.IGNORE;
}

/**
 * Returns true iff the flags have the METADATA bit set.
 */
export function isMetadata(flags: number): boolean {
  return (flags & FLAGS.METADATA) === FLAGS.METADATA;
}

/**
 * Returns true iff the flags have the COMPLETE bit set.
 */
export function isComplete(flags: number): boolean {
  return (flags & FLAGS.COMPLETE) === FLAGS.COMPLETE;
}

/**
 * Returns true iff the flags have the NEXT bit set.
 */
export function isNext(flags: number): boolean {
  return (flags & FLAGS.NEXT) === FLAGS.NEXT;
}

/**
 * Returns true iff the flags have the RESPOND bit set.
 */
export function isRespond(flags: number): boolean {
  return (flags & FLAGS.RESPOND) === FLAGS.RESPOND;
}

/**
 * Returns true iff the flags have the RESUME_ENABLE bit set.
 */
export function isResumeEnable(flags: number): boolean {
  return (flags & FLAGS.RESUME_ENABLE) === FLAGS.RESUME_ENABLE;
}

/**
 * Returns true iff the flags have the LEASE bit set.
 */
export function isLease(flags: number): boolean {
  return (flags & FLAGS.LEASE) === FLAGS.LEASE;
}

export function isFollows(flags: number): boolean {
  return (flags & FLAGS.FOLLOWS) === FLAGS.FOLLOWS;
}

/**
 * Returns true iff the frame type is counted toward the implied
 * client/server position used for the resumption protocol.
 */
export function isResumePositionFrameType(type: number): boolean {
  return (
    type === FRAME_TYPES.CANCEL ||
    type === FRAME_TYPES.ERROR ||
    type === FRAME_TYPES.PAYLOAD ||
    type === FRAME_TYPES.REQUEST_CHANNEL ||
    type === FRAME_TYPES.REQUEST_FNF ||
    type === FRAME_TYPES.REQUEST_RESPONSE ||
    type === FRAME_TYPES.REQUEST_STREAM ||
    type === FRAME_TYPES.REQUEST_N
  );
}

export function getFrameTypeName(type: number): string {
  const name = FRAME_TYPE_NAMES[type];
  return name != null ? name : toHex(type);
}

function sprintf(format, ...args) {
  let index = 0;
  return format.replace(/%s/g, match => args[index++]);
}

/**
 * Constructs an Error object given the contents of an error frame. The
 * `source` property contains metadata about the error for use in introspecting
 * the error at runtime:
 * - `error.source.code: number`: the error code returned by the server.
 * - `error.source.explanation: string`: human-readable explanation of the code
 *   (this value is not standardized and may change).
 * - `error.source.message: string`: the error string returned by the server.
 */
export function createErrorFromFrame(frame: ErrorFrame): Error {
  const {code, message} = frame;
  const explanation = getErrorCodeExplanation(code);
  const error = new Error(
    sprintf(
      'RSocket error %s (%s): %s. See error `source` property for details.',
      toHex(code),
      explanation,
      message,
    ),
  );
  (error: any).source = {
    code,
    explanation,
    message,
  };
  return error;
}

/**
 * Given a RSocket error code, returns a human-readable explanation of that
 * code, following the names used in the protocol specification.
 */
export function getErrorCodeExplanation(code: number): string {
  const explanation = ERROR_EXPLANATIONS[code];
  if (explanation != null) {
    return explanation;
  } else if (code <= 0x00300) {
    return 'RESERVED (PROTOCOL)';
  } else {
    return 'RESERVED (APPLICATION)';
  }
}

/**
 * Pretty-prints the frame for debugging purposes, with types, flags, and
 * error codes annotated with descriptive names.
 */
export function printFrame(frame: Frame): string {
  const obj: Object = {...frame};
  obj.type = getFrameTypeName(frame.type) + ` (${toHex(frame.type)})`;
  const flagNames = [];
  for (const name in FLAGS) {
    const flag = FLAGS[name];
    if ((frame.flags & flag) === flag) {
      flagNames.push(name);
    }
  }
  if (!flagNames.length) {
    flagNames.push('NO FLAGS');
  }
  obj.flags = flagNames.join(' | ') + ` (${toHex(frame.flags)})`;
  if (frame.type === FRAME_TYPES.ERROR) {
    obj.code = getErrorCodeExplanation(frame.code) + ` (${toHex(frame.code)})`;
  }
  return JSON.stringify(obj, null, 2);
}

function toHex(n: number): string {
  return '0x' + n.toString(16);
}
