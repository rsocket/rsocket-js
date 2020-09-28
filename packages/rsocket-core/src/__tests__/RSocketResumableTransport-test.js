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

/* eslint-disable */

import {
  ERROR_CODES,
  FLAGS,
  FLAGS_MASK,
  FRAME_TYPES,
  MAX_REQUEST_N,
} from '../RSocketFrame';
import RSocketResumableTransport from '../RSocketResumableTransport';
import {genMockConnection} from 'MockDuplexConnection';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import {genMockPublisher} from 'MockFlowableSubscription';
import {Flowable} from 'rsocket-flowable';
import {sizeOfFrame} from '../RSocketBinaryFraming';

jest.useFakeTimers();

describe('RSocketResumableTransport', () => {
  let bufferSize;
  let currentTransport;
  let resumableStatus;
  let resumeToken;
  let resumableTransport;
  let transportSource;

  let errorFrame;
  let requestFrame;
  let responseFrame;
  let resumeFrame;
  let resumeOkFrame;
  let setupFrame;

  beforeEach(() => {
    jest.clearAllTimers();

    bufferSize = 1024;
    resumeToken = '<resumeToken>';
    currentTransport = genMockConnection();
    transportSource = jest.fn(() => currentTransport);
    resumableTransport = new RSocketResumableTransport(transportSource, {
      bufferSize,
      resumeToken,
    });
    resumableTransport.connectionStatus().subscribe({
      onNext: (status) => (resumableStatus = status),
      onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
    });

    errorFrame = {
      code: 0x00000201, // application error
      flags: 0,
      type: FRAME_TYPES.ERROR,
      message: '<error>',
      streamId: 1,
    };
    requestFrame = {
      type: FRAME_TYPES.REQUEST_FNF,
      data: '{}',
      flags: FLAGS.METADATA,
      metadata: '{}',
      streamId: 1,
    };
    responseFrame = {
      streamId: 1,
      type: FRAME_TYPES.PAYLOAD,
      flags: FLAGS.COMPLETE | FLAGS.NEXT,
      data: '{}',
      metadata: '{}',
    };
    resumeFrame = {
      type: FRAME_TYPES.RESUME,
      flags: 0,
      resumeToken,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 1,
      clientPosition: 0,
      serverPosition: 0,
    };
    resumeOkFrame = {
      type: FRAME_TYPES.RESUME_OK,
      flags: 0,
      streamId: 0,
      clientPosition: 0,
    };
    setupFrame = {
      type: FRAME_TYPES.SETUP,
      data: undefined,
      dataMimeType: '<dataMimeType>',
      flags: 0,
      keepAlive: 42,
      lifetime: 2017,
      metadata: undefined,
      metadataMimeType: '<metadataMimeType>',
      resumeToken: null,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 1,
    };
  });

  it('is initially NOT_CONNECTED', () => {
    expect(resumableStatus.kind).toBe('NOT_CONNECTED');
  });

  it('it succeeds for v1.0 setup frames', () => {
    resumableTransport.connect();
    currentTransport.mock.connect();
    expect(resumableStatus.kind).toBe('CONNECTED');
    resumableTransport.sendOne({
      ...setupFrame,
      majorVersion: 1,
      minorVersion: 0,
    });
    expect(resumableStatus.kind).toBe('CONNECTED');
  });

  describe('buffering disabled (bufferSize === 0)', () => {
    beforeEach(() => {
      bufferSize = 0;
      resumableTransport = new RSocketResumableTransport(transportSource, {
        bufferSize,
        resumeToken,
      });
      resumableTransport.connectionStatus().subscribe({
        onNext: (status) => (resumableStatus = status),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });
    });

    it('sends frames when connected', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      resumableTransport.sendOne(setupFrame);
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      let sent = currentTransport.sendOne.mock.calls[0][0];
      expect(sent).toEqual({
        ...setupFrame,
        flags: FLAGS.RESUME_ENABLE,
        resumeToken,
        length: sizeOfFrame(sent),
      });
    });
  });

  describe('initiating a connection (NOT_CONNECTED -> CONNECTING)', () => {
    it('sets the status to CONNECTING', () => {
      resumableTransport.connect();
      expect(resumableStatus.kind).toBe('CONNECTING');
    });

    it('requests a transport from the source', () => {
      expect(transportSource.mock.calls.length).toBe(0);
      resumableTransport.connect();
      expect(transportSource.mock.calls.length).toBe(1);
    });

    it('connects to the transport', () => {
      expect(currentTransport.connect.mock.calls.length).toBe(0);
      resumableTransport.connect();
      expect(currentTransport.connect.mock.calls.length).toBe(1);
    });

    it('sends SETUP frames with the resume flag and given resume token', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      resumableTransport.sendOne({
        ...setupFrame,
        flags: FLAGS.LEASE,
        resumeToken: null,
      });
      let sent = currentTransport.sendOne.mock.calls[0][0];
      expect(sent).toEqual({
        ...setupFrame,
        flags: FLAGS.LEASE | FLAGS.RESUME_ENABLE, // RESUME_ENABLE added
        resumeToken, // added automatically
        length: sizeOfFrame(sent),
      });
    });

    it('sets the status to ERROR if the source throws', () => {
      const error = new Error('wtf');
      transportSource.mockImplementation(() => {
        throw error;
      });
      resumableTransport.connect();
      expect(resumableStatus.kind).toBe('ERROR');
      expect(resumableStatus.error).toBe(error);
    });

    it('returns frames from the transport once connected', () => {
      const frames = [];
      resumableTransport.receive().subscribe({
        onNext: (frame) => frames.push(frame),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.mock.receiver.onNext(errorFrame);
      currentTransport.mock.receiver.onNext(responseFrame);
      expect(frames.length).toBe(2);
      expect(frames[0]).toBe(errorFrame);
      expect(frames[1]).toBe(responseFrame);
    });

    it('buffers frames and writes to the transport once connected', () => {
      resumableTransport.send(
        new Flowable((subscriber) => {
          subscriber.onSubscribe({
            request: () => {
              subscriber.onNext(errorFrame);
              subscriber.onNext(responseFrame);
            },
          });
        }),
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(errorFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(responseFrame);
    });
  });

  describe('connection success/failure (CONNECTING -> *)', () => {
    it('on transport connect it updates to CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(resumableStatus.kind).toBe('CONNECTED');
    });

    it('on transport closed it updates to NOT_CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.close();
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('on transport error it updates to NOT_CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.closeWithError(new Error('wtf'));
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('returns frames from the transport once connected', () => {
      const frames = [];
      resumableTransport.receive().subscribe({
        onNext: (frame) => frames.push(frame),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.mock.receiver.onNext(errorFrame);
      currentTransport.mock.receiver.onNext(responseFrame);
      expect(frames.length).toBe(2);
      expect(frames[0]).toBe(errorFrame);
      expect(frames[1]).toBe(responseFrame);
    });

    it('buffers frames and writes to the transport once connected', () => {
      resumableTransport.send(
        new Flowable((subscriber) => {
          subscriber.onSubscribe({
            request: () => {
              subscriber.onNext(errorFrame);
              subscriber.onNext(responseFrame);
            },
          });
        }),
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(errorFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(responseFrame);
    });
  });

  describe('loss of connection (CONNECTED -> *)', () => {
    beforeEach(() => {
      resumableTransport.connect();
      currentTransport.mock.connect();
    });

    it('on transport CLOSED it updates to NOT_CONNECTED state', () => {
      currentTransport.mock.close();
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('on transport ERROR it updates to NOT_CONNECTED state', () => {
      currentTransport.mock.closeWithError(new Error('wtf'));
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('returns frames from the transport', () => {
      const frames = [];
      resumableTransport.receive().subscribe({
        onNext: (frame) => frames.push(frame),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });
      currentTransport.mock.receiver.onNext(errorFrame);
      currentTransport.mock.receiver.onNext(responseFrame);
      expect(frames.length).toBe(2);
      expect(frames[0]).toBe(errorFrame);
      expect(frames[1]).toBe(responseFrame);
    });

    it('writes frames to the transport', () => {
      resumableTransport.send(
        new Flowable((subscriber) => {
          subscriber.onSubscribe({
            request: () => {
              subscriber.onNext(errorFrame);
              subscriber.onNext(responseFrame);
            },
          });
        }),
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(errorFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(responseFrame);
    });
  });

  describe('reconnection prior to SETUP: new connection', () => {
    beforeEach(() => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.mock.close();

      currentTransport = genMockConnection();
      transportSource.mockClear();
      transportSource.mockImplementation(() => currentTransport);
    });

    it('on transport connect it updates to CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(resumableStatus.kind).toBe('CONNECTED');
    });

    it('on transport closed it updates to NOT_CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.close();
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('on transport error it updates to NOT_CONNECTED state', () => {
      resumableTransport.connect();
      currentTransport.mock.closeWithError(new Error('wtf'));
      expect(resumableStatus.kind).toBe('NOT_CONNECTED');
    });

    it('returns frames from the transport once connected', () => {
      const frames = [];
      resumableTransport.receive().subscribe({
        onNext: (frame) => frames.push(frame),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.mock.receiver.onNext(errorFrame);
      currentTransport.mock.receiver.onNext(responseFrame);
      expect(frames.length).toBe(2);
      expect(frames[0]).toBe(errorFrame);
      expect(frames[1]).toBe(responseFrame);
    });

    it('buffers frames and writes to the transport once connected', () => {
      resumableTransport.send(
        new Flowable((subscriber) => {
          subscriber.onSubscribe({
            request: () => {
              subscriber.onNext(errorFrame);
              subscriber.onNext(responseFrame);
            },
          });
        }),
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(errorFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(responseFrame);
    });
  });

  describe('reconnection after SETUP: resumes connection', () => {
    let majorVersion = 42;
    let minorVersion = 43;

    beforeEach(() => {
      // use custom version number to ensure that resume frame copies the setup version
      setupFrame = {
        ...setupFrame,
        majorVersion,
        minorVersion,
      };

      resumableTransport.connect();
      currentTransport.mock.connect();
      resumableTransport.sendOne(setupFrame);
      resumableTransport.sendOne(requestFrame);

      currentTransport.mock.close();
      currentTransport = genMockConnection();
      transportSource.mockClear();
      transportSource.mockImplementation(() => currentTransport);
    });

    it('connects and resumes when server has all client frames', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: 0,
        majorVersion,
        minorVersion,
        resumeToken,
        serverPosition: 0,
      });
      currentTransport.sendOne.mockClear();
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: sizeOfFrame(requestFrame), // server has the one resumable frame the client sent
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
    });

    it('buffers frames while resuming and sends once connected', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.sendOne.mockClear();

      expect(resumableStatus.kind).toBe('CONNECTING');
      const requestFrame2 = {...requestFrame, streamId: 3};
      resumableTransport.sendOne(requestFrame2);
      expect(currentTransport.sendOne.mock.calls.length).toBe(0); // buffered

      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: sizeOfFrame(requestFrame2),
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(requestFrame2);
    });

    it('connects and resumes when server is missing buffered frames', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: 0,
        majorVersion,
        minorVersion,
        resumeToken,
        serverPosition: 0,
      });
      currentTransport.sendOne.mockClear();
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: 0, // server is missing the first request frame
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(requestFrame);
    });

    it('buffers frames while resuming with missing frames, and sends once connected', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.sendOne.mockClear();

      expect(resumableStatus.kind).toBe('CONNECTING');
      const requestFrame2 = {...requestFrame, streamId: 3};
      resumableTransport.sendOne(requestFrame2);
      expect(currentTransport.sendOne.mock.calls.length).toBe(0); // buffered

      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: 0, // server is missing the first request frame
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(requestFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(requestFrame2);
    });

    it('connects and errors when server rejects resumption', () => {
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: 0,
        majorVersion,
        minorVersion,
        resumeToken,
        serverPosition: 0,
      });
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext(errorFrame);
      expect(resumableStatus.kind).toBe('ERROR');
      expect(resumableStatus.error.message).toBe(
        'RSocket error 0x201 (APPLICATION_ERROR): <error>. See error `source` property for details.',
      );
    });
  });

  describe('resumption when client has evicted sent frames from its buffer', () => {
    beforeEach(() => {
      bufferSize = 25;
      resumableTransport = new RSocketResumableTransport(transportSource, {
        bufferSize,
        resumeToken,
      });
      resumableTransport.connectionStatus().subscribe({
        onNext: (status) => (resumableStatus = status),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });

      // connect
      resumableTransport.connect();
      currentTransport.mock.connect();
      resumableTransport.sendOne(setupFrame);
    });

    function disconnect() {
      currentTransport.mock.close();
      currentTransport = genMockConnection();
      transportSource.mockClear();
      transportSource.mockImplementation(() => currentTransport);
    }

    it('resumes when server is missing all buffered frames', () => {
      // 3 frames, bufferSize 2: errorFrame is evicted from buffer
      resumableTransport.sendOne(errorFrame);
      resumableTransport.sendOne(requestFrame);
      resumableTransport.sendOne(responseFrame);
      currentTransport.sendOne.mockClear();

      disconnect();
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: sizeOfFrame(errorFrame), // the byte size of first frame (errorFrame) no longer buffered
        resumeToken,
        serverPosition: 0,
      });
      currentTransport.sendOne.mockClear();
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: sizeOfFrame(errorFrame), // server has the evicted frame but nothing else
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(2);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(requestFrame);
      expect(currentTransport.sendOne.mock.calls[1][0]).toBe(responseFrame);
    });

    it('resumes when server is missing some buffered frames', () => {
      // 3 frames, bufferSize 2: errorFrame is evicted from buffer
      resumableTransport.sendOne(errorFrame);
      resumableTransport.sendOne(requestFrame);
      resumableTransport.sendOne(responseFrame);
      currentTransport.sendOne.mockClear();

      disconnect();
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: sizeOfFrame(errorFrame), // first frame (errorFrame) no longer buffered
        resumeToken,
        serverPosition: 0,
      });
      currentTransport.sendOne.mockClear();
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: sizeOfFrame(errorFrame) + sizeOfFrame(requestFrame), // server has the first buffered frame, not second
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toBe(responseFrame);
    });

    it('resumes when server has all buffered frames', () => {
      // 3 frames, bufferSize 2: errorFrame is evicted from buffer
      resumableTransport.sendOne(errorFrame);
      resumableTransport.sendOne(requestFrame);
      resumableTransport.sendOne(responseFrame);
      currentTransport.sendOne.mockClear();

      disconnect();
      resumableTransport.connect();
      currentTransport.mock.connect();
      expect(currentTransport.sendOne.mock.calls.length).toBe(1);
      expect(currentTransport.sendOne.mock.calls[0][0]).toEqual({
        ...resumeFrame,
        clientPosition: sizeOfFrame(errorFrame), // first frame (errorFrame) no longer buffered
        resumeToken,
        serverPosition: 0,
      });
      currentTransport.sendOne.mockClear();
      expect(resumableStatus.kind).toBe('CONNECTING');
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition:
          sizeOfFrame(errorFrame) +
          sizeOfFrame(requestFrame) +
          sizeOfFrame(responseFrame), // server has all buffered frames (total bytesize)
      });
      expect(resumableStatus.kind).toBe('CONNECTED');
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
    });

    it('rejects resume when missing frames', () => {
      for (let i = 0; i < 10; i++) {
        resumableTransport.sendOne(requestFrame);
      }
      disconnect();

      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.sendOne.mockClear();
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: 0, // server received nothing
      });
      expect(resumableStatus.kind).toBe('ERROR');
      expect(resumableStatus.error.message).toBe(
        'RSocketResumableTransport: resumption failed, server is ' +
          'missing frames that are no longer in the client buffer.',
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
    });

    it('rejects resume when frame position is inconsistent', () => {
      resumableTransport.sendOne(requestFrame);
      resumableTransport.sendOne(requestFrame);

      disconnect();

      resumableTransport.connect();
      currentTransport.mock.connect();
      currentTransport.sendOne.mockClear();
      currentTransport.mock.receiver.onNext({
        ...resumeOkFrame,
        clientPosition: 15, // impossible position
      });
      expect(resumableStatus.kind).toBe('ERROR');
      expect(resumableStatus.error.message).toBe(
        'RSocketResumableTransport: local frames are inconsistent ' +
          'with remote implied position',
      );
      expect(currentTransport.sendOne.mock.calls.length).toBe(0);
    });
  });
});
