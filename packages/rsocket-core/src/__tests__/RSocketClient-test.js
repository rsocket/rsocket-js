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

import {
  ERROR_CODES,
  FLAGS,
  FLAGS_MASK,
  FRAME_TYPES,
  MAX_REQUEST_N,
} from '../RSocketFrame';
import RSocketClient from '../RSocketClient';
import {JsonSerializers} from '../RSocketSerialization';
import {genMockConnection} from 'MockDuplexConnection';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import {Single} from 'rsocket-flowable';

jest.useFakeTimers();

describe('RSocketClient', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('connect()', () => {
    it('calls the transport connect function', () => {
      const connection = genMockConnection();
      const transport = {
        connect: jest.fn(() => Single.of(connection)),
      };
      const client = new RSocketClient({transport});
      expect(transport.connect.mock.calls.length).toBe(0);
      client.connect().subscribe();
      expect(transport.connect.mock.calls.length).toBe(1);
      expect(() => client.connect()).toThrow('');
    });

    it('sends the setup frame', () => {
      const connection = genMockConnection();
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport: {
          connect: () => Single.of(connection),
        },
      });
      client.connect().subscribe();
      expect(connection.sendOne.mock.calls.length).toBe(1);
      expect(connection.sendOne.mock.frame).toEqual({
        type: FRAME_TYPES.SETUP,
        data: undefined,
        dataMimeType: '<dataMimeType>',
        flags: 0,
        keepAlive: 42,
        lifetime: 2017,
        metadata: undefined,
        metadataMimeType: '<metadataMimeType>',
        resumeToken: '',
        streamId: 0,
        majorVersion: 1,
        minorVersion: 0,
      });
    });

    it('resolves to a client socket if the transport connects', () => {
      const connection = genMockConnection();
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport: {
          connect: () => Single.of(connection),
        },
      });
      let socket;
      client.connect().subscribe({
        onComplete: _socket => socket = _socket,
      });
      expect(typeof socket.fireAndForget).toEqual('function');
    });

    it('rejects if the transport fails to connect', () => {
      const connectionError = new Error('wtf');
      const single = new Single(subscriber => {
        throw connectionError;
      });
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport: {
          connect: () => single,
        },
      });
      let error;
      client.connect().subscribe({
        onError: _error => error = _error,
      });
      expect(error).toBe(connectionError);
    });
  });

  describe('keepalive', () => {
    const keepAlive = 42;
    let keepAliveFrames;
    let connection;
    let client;
    let socket;

    beforeEach(() => {
      connection = genMockConnection();
      client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport: {
          connect: () => Single.of(connection),
        },
      });
      client.connect().subscribe({
        onComplete(_socket) {
          socket = _socket;
        },
      });
      expect(connection.send.mock.calls.length).toBe(1);
      keepAliveFrames = connection.send.mock.frames;
      connection.mockClear();
    });

    it('sends keepalive frames', () => {
      const onNext = jest.fn();
      keepAliveFrames.subscribe({
        onNext,
        onSubscribe: sub => sub.request(Number.MAX_SAFE_INTEGER),
      });

      jest.runTimersToTime(keepAlive - 1);
      expect(onNext.mock.calls.length).toBe(0);

      jest.runTimersToTime(1);
      expect(onNext.mock.calls.length).toBe(1);
      expect(onNext.mock.calls[0][0]).toEqual({
        type: FRAME_TYPES.KEEPALIVE,
        data: null,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: 0,
        streamId: 0,
      });
    });

    it('counts ERROR frames in lastReceivedPosition', () => {
      const onNext = jest.fn();
      keepAliveFrames.subscribe({
        onNext,
        onSubscribe: sub => sub.request(Number.MAX_SAFE_INTEGER),
      });

      jest.runTimersToTime(keepAlive - 1);
      expect(onNext.mock.calls.length).toBe(0);

      socket.requestResponse({data: null, metadata: null}).subscribe();
      const errorFrame = {
        code: 0x00000201, // application error
        flags: 0,
        type: FRAME_TYPES.ERROR,
        message: '<error>',
        streamId: 1,
      };
      connection.receive.mock.publisher.onNext(errorFrame);

      jest.runTimersToTime(1);
      expect(onNext.mock.calls.length).toBe(1);
      expect(onNext.mock.calls[0][0]).toEqual({
        type: FRAME_TYPES.KEEPALIVE,
        data: null,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: 1,
        streamId: 0,
      });
    });

    it('counts PAYLOAD frames in lastReceivedPosition', () => {
      const onNext = jest.fn();
      keepAliveFrames.subscribe({
        onNext,
        onSubscribe: sub => sub.request(Number.MAX_SAFE_INTEGER),
      });

      jest.runTimersToTime(keepAlive - 1);
      expect(onNext.mock.calls.length).toBe(0);

      socket.requestResponse({data: null, metadata: null}).subscribe();
      const responseFrame = {
        streamId: 1,
        type: FRAME_TYPES.PAYLOAD,
        flags: FLAGS.COMPLETE | FLAGS.NEXT,
        data: '{}',
        metadata: '{}',
      };
      connection.receive.mock.publisher.onNext(responseFrame);

      jest.runTimersToTime(1);
      expect(onNext.mock.calls.length).toBe(1);
      expect(onNext.mock.calls[0][0]).toEqual({
        type: FRAME_TYPES.KEEPALIVE,
        data: null,
        flags: FLAGS.RESPOND,
        lastReceivedPosition: 1,
        streamId: 0,
      });
    });

    it('responds to keepalive frames from the server', () => {
      connection.receive.mock.publisher.onNext({
        type: FRAME_TYPES.KEEPALIVE,
        data: '<data>',
        flags: FLAGS_MASK,
        lastReceivedPosition: 123,
        streamId: 0,
      });
      expect(connection.send.mock.calls.length).toBe(0);
      expect(connection.sendOne.mock.calls.length).toBe(1);
      expect(connection.sendOne.mock.frame).toEqual({
        data: '<data>', // echoed back
        flags: FLAGS_MASK ^ FLAGS.RESPOND,
        lastReceivedPosition: 0, // zeroed out
        streamId: 0,
        type: FRAME_TYPES.KEEPALIVE,
      });
    });

    it('ignores non-respond keepalive frames from the server', () => {
      connection.receive.mock.publisher.onNext({
        type: FRAME_TYPES.KEEPALIVE,
        data: null,
        flags: 0, // respond bit not set
        lastReceivedPosition: 123,
        streamId: 0,
      });
      expect(connection.send.mock.calls.length).toBe(0);
      expect(connection.sendOne.mock.calls.length).toBe(0);
    });
  });

  describe('stream APIs', () => {
    let connection;
    let client;
    let payload;
    let socket;
    let subscriber;

    function createSocket(serializers) {
      const connection = genMockConnection();
      const client = new RSocketClient({
        serializers,
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 1000,
          lifetime: 10000,
          metadataMimeType: '<metadataMimeType>',
        },
        transport: {
          connect: () => Single.of(connection),
        },
      });
      let socket;
      client.connect().subscribe({
        onComplete(_socket) {
          socket = _socket;
        },
      });
      connection.mockClear();
      return {connection, client, socket};
    }

    beforeEach(() => {
      ({connection, client, socket} = createSocket());
      payload = Object.freeze({
        data: JSON.stringify({data: true}),
        metadata: JSON.stringify({metadata: true}),
      });
      subscriber = genMockSubscriber({
        onSubscribe(subscription) {
          subscription.request && subscription.request(Number.MAX_SAFE_INTEGER);
        },
      });
    });

    describe('fireAndForget()', () => {
      it('sends the payload', () => {
        socket.fireAndForget(payload);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_FNF,
          data: payload.data,
          flags: FLAGS.METADATA,
          metadata: payload.metadata,
          streamId: 1,
        });
      });

      it('sends the payload with serialized data', () => {
        ({socket, connection} = createSocket(JsonSerializers));
        socket.fireAndForget({
          data: {data: true},
          metadata: {metadata: true},
        });
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_FNF,
          data: '{"data":true}',
          flags: FLAGS.METADATA,
          metadata: '{"metadata":true}',
          streamId: 1,
        });
      });
    });

    describe('requestResponse()', () => {
      // -> open
      it('sends the payload', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_RESPONSE,
          data: payload.data,
          flags: FLAGS.METADATA,
          metadata: payload.metadata,
          streamId: 1,
        });
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      it('sends the payload with serialized data', () => {
        ({socket, connection} = createSocket(JsonSerializers));
        payload = {
          data: {data: true},
          metadata: {metadata: true},
        };
        socket.requestResponse(payload).subscribe(subscriber);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_RESPONSE,
          data: '{"data":true}',
          flags: FLAGS.METADATA,
          metadata: '{"metadata":true}',
          streamId: 1,
        });
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> cancel() -> closed
      it('sends a cancellation frame when cancelled', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        subscriber.onSubscribe.mock.calls[0][0]();
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.CANCEL,
          flags: 0,
          streamId: 1,
        });
      });

      // open -> response.error() -> closed
      it('errors when an error payload is received', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        const errorFrame = {
          code: 0x00000201, // application error
          flags: 0,
          type: FRAME_TYPES.ERROR,
          message: '<error>',
          streamId: 1,
        };
        connection.receive.mock.publisher.onNext(errorFrame);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe(
          'RSocket error 0x201 (APPLICATION_ERROR): <error>. See error `source` property for details.',
        );
        expect(error.source.code).toBe(0x00000201);
        expect(error.source.explanation).toBe('APPLICATION_ERROR');
        expect(error.source.message).toBe('<error>');
      });

      // open -> response.next/complete() -> closed
      it('publishes and completes when a next/completed payload is received', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
        const response = subscriber.onComplete.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);
      });

      // open -> response.next() -> closed
      it('publishes and completes when a next/non-completed payload is received', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
        const response = subscriber.onComplete.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);
      });

      // open -> socket.close() -> closed (errors)
      it('errors if the socket is closed', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        socket.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocketClient: The connection was closed.');
      });

      // open -> connection.close() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        connection.mock.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocketClient: The connection was closed.');
      });

      // open -> connection.error() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        const error = new Error('wtf');
        socket.requestResponse(payload).subscribe(subscriber);
        connection.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });
    });

    describe('requestStream()', () => {
      beforeEach(() => {
        // don't automatically `request` data in onSubscribe
        subscriber = genMockSubscriber();
      });

      // -> waiting
      it('does not immediately send any frames', () => {
        socket.requestStream(payload).subscribe(subscriber);
        expect(connection.sendOne.mock.calls.length).toBe(0);
        expect(connection.send.mock.calls.length).toBe(0);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      // waiting -> request() -> open (requests)
      it('sends a request frame on the first request', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_STREAM,
          data: payload.data,
          flags: FLAGS.METADATA,
          requestN: 42,
          metadata: payload.metadata,
          streamId: 1,
        });

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('sends the payload with serialized data', () => {
        ({socket, connection} = createSocket(JsonSerializers));
        payload = {
          data: {data: true},
          metadata: {metadata: true},
        };
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_STREAM,
          data: '{"data":true}',
          flags: FLAGS.METADATA,
          metadata: '{"metadata":true}',
          requestN: 42,
          streamId: 1,
        });
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // waiting -> request(> max) -> open (request max)
      it('sends a max request frame on the first request', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(MAX_REQUEST_N);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_STREAM,
          data: payload.data,
          flags: FLAGS.METADATA,
          requestN: MAX_REQUEST_N,
          metadata: payload.metadata,
          streamId: 1,
        });

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      // waiting -> cancel() -> closed (n/a)
      it('does not send a cancellation frame if cancelled before making a request', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.cancel();
        expect(connection.sendOne.mock.calls.length).toBe(0);
        expect(connection.send.mock.calls.length).toBe(0);
      });

      // open -> response.error() -> closed (errors)
      it('errors when an error payload is received', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const errorFrame = {
          code: 0x00000201, // application error
          flags: 0,
          type: FRAME_TYPES.ERROR,
          message: '<error>',
          streamId: 1,
        };
        connection.receive.mock.publisher.onNext(errorFrame);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe(
          'RSocket error 0x201 (APPLICATION_ERROR): <error>. See error `source` property for details.',
        );
        expect(error.source.code).toBe(0x00000201);
        expect(error.source.explanation).toBe('APPLICATION_ERROR');
        expect(error.source.message).toBe('<error>');
      });

      // open -> response.next/complete() -> closed
      it('publishes and completes when a next/completed payload is received', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
      });

      // open -> response.next() -> response.next/complete() -> closed
      it('publishes and completes when a next/completed payload is received', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        expect(subscriber.onComplete.mock.calls.length).toBe(0);

        const responseFrame2 = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame2);
        expect(subscriber.onNext.mock.calls.length).toBe(2);
        const response = subscriber.onNext.mock.calls[1][0];
        expect(response.data).toBe(responseFrame2.data);
        expect(response.metadata).toBe(responseFrame2.metadata);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
      });

      // open -> response.next() -> open (publishes)
      it('publishes when a next/non-completed payload is received', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> response.next() (2x) -> open (publishes)
      it('publishes multiple next/non-completed payloads', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);

        const responseFrame2 = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        connection.receive.mock.publisher.onNext(responseFrame2);
        expect(subscriber.onNext.mock.calls.length).toBe(2);
        const response2 = subscriber.onNext.mock.calls[1][0];
        expect(response2.data).toBe(responseFrame2.data);
        expect(response2.metadata).toBe(responseFrame2.metadata);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> request() -> open (requests)
      it('sends a request n frame on subsequent requests', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        connection.mockClear();
        subscriber.mock.request(43);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_N,
          flags: 0,
          streamId: 1,
          requestN: 43,
        });

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> request(max) -> open (requests max)
      it('sends a request n frame on subsequent requests', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        connection.mockClear();
        subscriber.mock.request(MAX_REQUEST_N);
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_N,
          flags: 0,
          streamId: 1,
          requestN: MAX_REQUEST_N,
        });

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> cancel() -> closed (sends cancel)
      it('sends a cancellation frame when cancelled', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        connection.mockClear();
        subscriber.mock.cancel();
        expect(connection.sendOne.mock.calls.length).toBe(1);
        expect(connection.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.CANCEL,
          flags: 0,
          streamId: 1,
        });
      });

      // open -> socket.close() -> closed (errors)
      it('errors if the socket is closed', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        connection.mockClear();
        socket.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocketClient: The connection was closed.');
      });

      // waiting -> connection.error() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        const error = new Error('wtf');
        socket.requestStream(payload).subscribe(subscriber);
        connection.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });

      // open -> connection.error() -> closed (errors)
      it('errors if the connection terminates with an error after requesting data', () => {
        const error = new Error('wtf');
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        connection.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });
    });

    describe('requestChannel()', () => {});

    describe('metadataPush()', () => {});

    describe('close()', () => {
      let connection;
      let resolve;
      let socket;

      beforeEach(() => {
        connection = genMockConnection();
        client = new RSocketClient({
          setup: {
            dataMimeType: '<dataMimeType>',
            keepAlive: 1000,
            lifetime: 10000,
            metadataMimeType: '<metadataMimeType>',
          },
          transport: {
            connect: () => Single.of(connection),
          },
        });
        client.connect().subscribe({
          onComplete: _socket => socket = _socket,
        });
      });

      it('closes the underlying socket', () => {
        socket.close();
        expect(connection.close).toBeCalled();
      });
    });

    describe('onClose()', () => {
      let connection;
      let reject;
      let resolve;
      let socket;

      beforeEach(() => {
        connection = genMockConnection();
        client = new RSocketClient({
          setup: {
            dataMimeType: '<dataMimeType>',
            keepAlive: 1000,
            lifetime: 10000,
            metadataMimeType: '<metadataMimeType>',
          },
          transport: {
            connect: () => Single.of(connection),
          },
        });
        client.connect().subscribe({
          onComplete: _socket => socket = _socket,
        });
        reject = jest.fn();
        resolve = jest.fn();
        socket.onClose().then(resolve, reject);
      });

      it('resolves when explicitly close()-d', () => {
        socket.close();
        jest.runAllTimers();
        expect(resolve).toBeCalled();
      });

      it('rejects when a connection-level error occurs', () => {
        const errorFrame = {
          code: ERROR_CODES.REJECTED_SETUP,
          flags: 0,
          type: FRAME_TYPES.ERROR,
          message: '<error>',
          streamId: 0,
        };
        connection.receive.mock.publisher.onNext(errorFrame);
        jest.runAllTimers();
        expect(reject).toBeCalled();
      });

      it('rejects when the transport closes', () => {
        connection.mock.close();
        jest.runAllTimers();
        expect(reject).toBeCalled();
        expect(reject.mock.calls[0][0].message).toBe(
          'RSocketClient: The connection was closed.',
        );
      });

      it('rejects when the connection closes due to an error', () => {
        connection.mock.closeWithError(new Error('wtf'));
        jest.runAllTimers();
        expect(reject).toBeCalled();
        expect(reject.mock.calls[0][0].message).toBe('wtf');
      });

      it('rejects when the transport receive() completes', () => {
        connection.receive.mock.publisher.onComplete();
        jest.runAllTimers();
        expect(reject).toBeCalled();
        expect(reject.mock.calls[0][0].message).toBe(
          'RSocketClient: The connection was closed.',
        );
      });

      it('rejects when the transport receive() errors', () => {
        connection.receive.mock.publisher.onError(new Error('wtf'));
        jest.runAllTimers();
        expect(reject).toBeCalled();
        expect(reject.mock.calls[0][0].message).toBe('wtf');
      });
    });
  });
});
