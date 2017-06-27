/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

/* eslint-disable */

import {FLAGS, FRAME_TYPES} from '../RSocketFrame';
import {
  deserializeFrames,
  deserializeFrame,
  serializeFrame,
  serializeFrameWithLength,
} from '../RSocketBinaryFraming';
import {BufferEncoders} from '../RSocketEncoding';

describe('RSocketBinaryFraming', () => {
  describe('length-prefixed framing', () => {
    let buffer1;
    let buffer2;
    let frame1;
    let frame2;

    beforeEach(() => {
      frame1 = {
        type: FRAME_TYPES.SETUP,
        data: '<data>',
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.METADATA | FLAGS.LEASE,
        keepAlive: 123,
        lifetime: 456,
        metadata: '<metadata>',
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      buffer1 = serializeFrameWithLength(frame1);
      frame2 = {
        type: FRAME_TYPES.REQUEST_N,
        flags: 0,
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      buffer2 = serializeFrameWithLength(frame2);
    });

    it('returns remaining bytes of a frame with partial length prefix', () => {
      const partial = buffer1.slice(0, 2); // incomplete length prefix
      const [frames, buffer] = deserializeFrames(partial);
      expect(frames.length).toBe(0);
      expect(buffer.toString('hex')).toEqual(partial.toString('hex'));
    });

    it('returns remaining bytes of a partial frame', () => {
      const partial = buffer1.slice(0, buffer1.length - 1);
      const [frames, buffer] = deserializeFrames(partial);
      expect(frames.length).toBe(0);
      expect(buffer.toString('hex')).toEqual(partial.toString('hex'));
    });

    it('deserializes a single frame without remaining bytes', () => {
      const [frames, buffer] = deserializeFrames(buffer1);
      expect(frames).toEqual([frame1]);
      expect(buffer.length).toBe(0);
    });

    it('deserializes a single frame with partial length prefix', () => {
      const partial = buffer2.slice(0, 2); // incomplete length prefix
      const [frames, buffer] = deserializeFrames(
        Buffer.concat([buffer1, partial]),
      );
      expect(frames).toEqual([frame1]);
      expect(buffer.toString('hex')).toEqual(partial.toString('hex'));
    });

    it('deserializes a single frame with remaining bytes', () => {
      const partial = buffer2.slice(0, buffer2.length - 1);
      const [frames, buffer] = deserializeFrames(
        Buffer.concat([buffer1, partial]),
      );
      expect(frames).toEqual([frame1]);
      expect(buffer.toString('hex')).toEqual(partial.toString('hex'));
    });

    it('deserializes multiple frames without remaining bytes', () => {
      const [frames, buffer] = deserializeFrames(
        Buffer.concat([buffer1, buffer2]),
      );
      expect(frames).toEqual([frame1, frame2]);
      expect(buffer.length).toBe(0);
    });
  });

  describe('SETUP', () => {
    it('serializes SETUP frames', () => {
      const frame = {
        type: FRAME_TYPES.SETUP,
        data: '<data>',
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.METADATA | FLAGS.LEASE,
        keepAlive: 123,
        lifetime: 456,
        metadata: '<metadata>',
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes SETUP frames with binary', () => {
      const frame = {
        type: FRAME_TYPES.SETUP,
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.METADATA | FLAGS.LEASE,
        keepAlive: 123,
        lifetime: 456,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        metadataMimeType: '<metadataMimeType>',
        resumeToken: new Buffer([0xa0, 0xb0, 0xc0]),
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes SETUP frames without data/metadata', () => {
      const frame = {
        type: FRAME_TYPES.SETUP,
        data: null,
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.LEASE,
        keepAlive: 123,
        lifetime: 456,
        metadata: null,
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes SETUP frames without data', () => {
      const frame = {
        type: FRAME_TYPES.SETUP,
        data: null,
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.LEASE | FLAGS.METADATA,
        keepAlive: 123,
        lifetime: 456,
        metadata: '<metadata>',
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes SETUP frames without metadata', () => {
      const frame = {
        type: FRAME_TYPES.SETUP,
        data: '<data>',
        dataMimeType: '<dataMimeType>',
        flags: FLAGS.IGNORE | FLAGS.LEASE,
        keepAlive: 123,
        lifetime: 456,
        metadata: null,
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('REQUEST_STREAM', () => {
    it('serializes REQUEST_STREAM frames', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_STREAM,
        data: '<data>',
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_STREAM frames with binary data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_STREAM,
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        flags: FLAGS.METADATA,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes REQUEST_STREAM frames without data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_STREAM,
        data: null,
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_STREAM frames without metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_STREAM,
        data: '<data>',
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_STREAM frames without data/metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_STREAM,
        data: null,
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('REQUEST_CHANNEL', () => {
    it('serializes REQUEST_CHANNEL frames', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_CHANNEL,
        data: '<data>',
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_CHANNEL frames with binary data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_CHANNEL,
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        flags: FLAGS.METADATA,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes REQUEST_CHANNEL frames without data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_CHANNEL,
        data: null,
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_CHANNEL frames without metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_CHANNEL,
        data: '<data>',
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_CHANNEL frames without data/metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_CHANNEL,
        data: null,
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
        requestN: 0x01020304,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('REQUEST_FNF', () => {
    it('serializes REQUEST_FNF frames', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_FNF,
        data: '<data>',
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_FNF frames with binary data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_FNF,
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        flags: FLAGS.METADATA,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes REQUEST_FNF frames without data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_FNF,
        data: null,
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_FNF frames without metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_FNF,
        data: '<data>',
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_FNF frames without data/metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_FNF,
        data: null,
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('REQUEST_RESPONSE', () => {
    it('serializes REQUEST_RESPONSE frames', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: '<data>',
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_RESPONSE frames with binary data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        flags: FLAGS.METADATA,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes REQUEST_RESPONSE frames without data', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: null,
        flags: FLAGS.METADATA,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_RESPONSE frames without metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: '<data>',
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes REQUEST_RESPONSE frames without data/metadata', () => {
      const frame = {
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: null,
        flags: 0,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('ERROR', () => {
    it('serializes ERROR frames', () => {
      const frame = {
        type: FRAME_TYPES.ERROR,
        flags: FLAGS.IGNORE,
        code: 0x01020304,
        message: '<errorMessage>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes ERROR frames with an empty message', () => {
      const frame = {
        type: FRAME_TYPES.ERROR,
        flags: FLAGS.IGNORE,
        code: 0x01020304,
        message: '', // non-nullable
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('PAYLOAD', () => {
    it('serializes PAYLOAD frames', () => {
      const frame = {
        data: '<data>',
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.METADATA | FLAGS.COMPLETE | FLAGS.NEXT,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes PAYLOAD frames with binary data', () => {
      const frame = {
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.METADATA | FLAGS.COMPLETE | FLAGS.NEXT,
        metadata: new Buffer([0x0d, 0x0e, 0x0f]),
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes PAYLOAD frames without data', () => {
      const frame = {
        data: null,
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.METADATA | FLAGS.COMPLETE | FLAGS.NEXT,
        metadata: '<metadata>',
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes PAYLOAD frames without metadata', () => {
      const frame = {
        data: '<data>',
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.COMPLETE | FLAGS.NEXT,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes PAYLOAD frames without data/metadata', () => {
      const frame = {
        data: null,
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.COMPLETE | FLAGS.NEXT,
        metadata: null,
        streamId: 0x0a0b0c0d,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('KEEPALIVE', () => {
    it('serializes KEEPALIVE frames', () => {
      const frame = {
        data: '<data>',
        type: FRAME_TYPES.KEEPALIVE,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: Number.MAX_SAFE_INTEGER,
        streamId: 0,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes KEEPALIVE frames with binary data', () => {
      const frame = {
        data: new Buffer([0x0a, 0x0b, 0x0c]),
        type: FRAME_TYPES.KEEPALIVE,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: Number.MAX_SAFE_INTEGER,
        streamId: 0,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes KEEPALIVE frames without data', () => {
      const frame = {
        data: null,
        type: FRAME_TYPES.KEEPALIVE,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: Number.MAX_SAFE_INTEGER,
        streamId: 0,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('LEASE', () => {
    it('serializes LEASE frames', () => {
      const frame = {
        flags: 0,
        metadata: '<metadata>',
        requestCount: 0x01020304,
        streamId: 0,
        ttl: 0x0a0b0c0d,
        type: FRAME_TYPES.LEASE,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });

    it('serializes LEASE frames with binary metadata', () => {
      const frame = {
        flags: 0,
        metadata: new Buffer([0x0a, 0x0b, 0x0c]),
        requestCount: 0x01020304,
        streamId: 0,
        ttl: 0x0a0b0c0d,
        type: FRAME_TYPES.LEASE,
      };
      const buffer = serializeFrame(frame, BufferEncoders);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer, BufferEncoders)).toEqual(frame);
    });

    it('serializes LEASE frames without metadata', () => {
      const frame = {
        flags: 0,
        metadata: null,
        requestCount: 0x01020304,
        streamId: 0,
        ttl: 0x0a0b0c0d,
        type: FRAME_TYPES.LEASE,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('RESUME', () => {
    it('serializes RESUME frames', () => {
      const frame = {
        type: FRAME_TYPES.RESUME,
        flags: FLAGS.IGNORE | FLAGS.METADATA | FLAGS.LEASE,
        resumeToken: '<resumeToken>',
        streamId: 0,
        majorVersion: 42,
        minorVersion: 24,
        clientPosition: 43,
        serverPosition: 34,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  describe('RESUME_OK', () => {
    it('serializes RESUME_OK frames', () => {
      const frame = {
        type: FRAME_TYPES.RESUME_OK,
        flags: FLAGS.IGNORE | FLAGS.METADATA | FLAGS.LEASE,
        streamId: 0,
        clientPosition: 43,
      };
      const buffer = serializeFrame(frame);
      expect(buffer.toString('hex')).toMatchSnapshot();
      expect(deserializeFrame(buffer)).toEqual(frame);
    });
  });

  it('serializes REQUEST_N frames', () => {
    const frame = {
      type: FRAME_TYPES.REQUEST_N,
      flags: 0,
      streamId: 0x0a0b0c0d,
      requestN: 0x01020304,
    };
    const buffer = serializeFrame(frame);
    expect(buffer.toString('hex')).toMatchSnapshot();
    expect(deserializeFrame(buffer)).toEqual(frame);
  });

  it('serializes CANCEL frames', () => {
    const frame = {
      type: FRAME_TYPES.CANCEL,
      flags: FLAGS.IGNORE,
      streamId: 0x0a0b0c0d,
    };
    const buffer = serializeFrame(frame);
    expect(buffer.toString('hex')).toMatchSnapshot();
    expect(deserializeFrame(buffer)).toEqual(frame);
  });
});
