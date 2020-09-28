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

import {FLAGS, FLAGS_MASK, FRAME_TYPES, MAX_REQUEST_N} from '../RSocketFrame';
import RSocketClient from '../RSocketClient';
import {JsonSerializers} from '../RSocketSerialization';
import {genMockConnection} from 'MockDuplexConnection';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import {Flowable} from 'rsocket-flowable';

jest.useFakeTimers();

describe('RSocketClient', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('connect()', () => {
    it('calls the transport connect function', () => {
      const transport = genMockConnection();
      const client = new RSocketClient({transport});
      expect(transport.connect.mock.calls.length).toBe(0);
      client.connect().subscribe();
      expect(transport.connect.mock.calls.length).toBe(1);
      expect(() => client.connect()).toThrow('');
    });

    it('sends the setup frame', () => {
      const transport = genMockConnection();
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
      });
      client.connect().subscribe();
      transport.mock.connect();
      expect(transport.sendOne.mock.calls.length).toBe(1);
      expect(transport.sendOne.mock.frame).toEqual({
        type: FRAME_TYPES.SETUP,
        dataMimeType: '<dataMimeType>',
        flags: 0,
        keepAlive: 42,
        lifetime: 2017,
        metadata: undefined,
        metadataMimeType: '<metadataMimeType>',
        resumeToken: null,
        streamId: 0,
        majorVersion: 1,
        minorVersion: 0,
      });
    });

    it('sends the setup frame with metadata', () => {
      const transport = genMockConnection();
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          payload: {
            metadata: '<metadata>',
          },
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
      });
      client.connect().subscribe();
      transport.mock.connect();
      expect(transport.sendOne.mock.calls.length).toBe(1);
      expect(transport.sendOne.mock.frame).toEqual({
        type: FRAME_TYPES.SETUP,
        data: undefined,
        dataMimeType: '<dataMimeType>',
        flags: 256,
        keepAlive: 42,
        lifetime: 2017,
        metadata: '<metadata>',
        metadataMimeType: '<metadataMimeType>',
        resumeToken: null,
        streamId: 0,
        majorVersion: 1,
        minorVersion: 0,
      });
    });

    it('sends the setup frame with data', () => {
      const transport = genMockConnection();
      const payload = JSON.stringify({one: 42, two: {embedded: 'myvalue'}});
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
          payload: {
            data: '<data>',
          },
        },
        transport,
      });
      client.connect().subscribe();
      transport.mock.connect();
      expect(transport.sendOne.mock.calls.length).toBe(1);
      expect(transport.sendOne.mock.frame).toEqual({
        type: FRAME_TYPES.SETUP,
        data: '<data>',
        dataMimeType: '<dataMimeType>',
        flags: 0,
        keepAlive: 42,
        lifetime: 2017,
        metadataMimeType: '<metadataMimeType>',
        resumeToken: null,
        streamId: 0,
        majorVersion: 1,
        minorVersion: 0,
      });
    });

    it('resolves to a client socket if the transport connects', () => {
      const transport = genMockConnection();
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
      });
      let socket;
      client.connect().subscribe({
        onComplete: (_socket) => (socket = _socket),
      });
      transport.mock.connect();
      expect(typeof socket.fireAndForget).toEqual('function');
      expect(typeof socket.metadataPush).toEqual('function');
      expect(typeof socket.requestChannel).toEqual('function');
      expect(typeof socket.requestResponse).toEqual('function');
      expect(typeof socket.requestStream).toEqual('function');
    });

    it('rejects if the transport fails to connect', () => {
      const transport = genMockConnection();
      const connectionError = new Error('wtf');
      transport.connect = () => {
        transport.mock.closeWithError(connectionError);
      };
      const client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 42,
          lifetime: 2017,
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
      });
      let error;
      client.connect().subscribe({
        onError: (_error) => (error = _error),
      });
      transport.mock.connect();
      expect(error).toBe(connectionError);
    });
  });

  describe('keepalive', () => {
    const realNow = Date.now;

    const keepAliveInterval = 42;
    const keepAliveTimeout = 1000;
    let keepAliveFrames;
    let transport;
    let client;
    let socket;
    const errors = new Set();

    beforeEach(() => {
      transport = genMockConnection();
      client = new RSocketClient({
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: keepAliveInterval,
          lifetime: keepAliveTimeout,
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
        errorHandler: (err) => errors.add(err.message),
      });
      client.connect().subscribe({
        onComplete(_socket) {
          socket = _socket;
        },
      });
      transport.mock.connect();
      expect(transport.send.mock.calls.length).toBe(1);
      keepAliveFrames = transport.send.mock.frames;
      transport.mockClear();
    });

    afterEach(() => {
      Date.now = realNow;
    });

    it('sends keepalive frames', () => {
      const onNext = jest.fn();
      keepAliveFrames.subscribe({
        onNext,
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });

      jest.runTimersToTime(keepAliveInterval - 1);
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

    it('responds to keepalive frames from the server', () => {
      transport.receive.mock.publisher.onNext({
        type: FRAME_TYPES.KEEPALIVE,
        data: '<data>',
        flags: FLAGS_MASK,
        lastReceivedPosition: 123,
        streamId: 0,
      });
      expect(transport.send.mock.calls.length).toBe(0);
      expect(transport.sendOne.mock.calls.length).toBe(1);
      expect(transport.sendOne.mock.frame).toEqual({
        data: '<data>', // echoed back
        flags: FLAGS_MASK ^ FLAGS.RESPOND,
        lastReceivedPosition: 0, // zeroed out
        streamId: 0,
        type: FRAME_TYPES.KEEPALIVE,
      });
    });

    it('ignores non-respond keepalive frames from the server', () => {
      transport.receive.mock.publisher.onNext({
        type: FRAME_TYPES.KEEPALIVE,
        data: null,
        flags: 0, // respond bit not set
        lastReceivedPosition: 123,
        streamId: 0,
      });
      expect(transport.send.mock.calls.length).toBe(0);
      expect(transport.sendOne.mock.calls.length).toBe(0);
    });

    it('closes rsocket on missing keepalive', () => {
      let status;
      socket.connectionStatus().subscribe({
        onNext: (_status) => (status = _status),
        onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
      });

      Date.now = jest.fn().mockReturnValue(Date.now() + keepAliveTimeout);
      jest.advanceTimersByTime(keepAliveTimeout);

      expect(errors.size).toEqual(1);
      expect(errors.values().next().value).toEqual(
        `No keep-alive acks for ${keepAliveTimeout} millis`,
      );
      expect(status.kind).toEqual('CLOSED');

      jest.advanceTimersByTime(keepAliveTimeout);
    });
  });

  describe('stream APIs', () => {
    let transport;
    let client;
    let payload;
    let payloads;
    let socket;
    let subscriber;

    function createSocket(serializers) {
      const transport = genMockConnection();
      const client = new RSocketClient({
        serializers,
        setup: {
          dataMimeType: '<dataMimeType>',
          keepAlive: 1000,
          lifetime: 10000,
          metadataMimeType: '<metadataMimeType>',
        },
        transport,
      });
      let socket;
      client.connect().subscribe({
        onComplete(_socket) {
          socket = _socket;
        },
      });
      transport.mock.connect();
      transport.mockClear();
      return {transport, client, socket};
    }

    beforeEach(() => {
      ({transport, client, socket} = createSocket());
      payload = Object.freeze({
        data: JSON.stringify({data: true}),
        metadata: JSON.stringify({metadata: true}),
      });
      payloads = Flowable.just(payload, payload);
      subscriber = genMockSubscriber({
        onSubscribe(subscription) {
          subscription.request && subscription.request(Number.MAX_SAFE_INTEGER);
        },
      });
    });

    describe('fireAndForget()', () => {
      it('sends the payload', () => {
        socket.fireAndForget(payload);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_FNF,
          data: payload.data,
          flags: FLAGS.METADATA,
          metadata: payload.metadata,
          streamId: 1,
        });
      });

      it('sends the payload with serialized data', () => {
        ({socket, transport} = createSocket(JsonSerializers));
        socket.fireAndForget({
          data: {data: true},
          metadata: {metadata: true},
        });
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        ({socket, transport} = createSocket(JsonSerializers));
        payload = {
          data: {data: true},
          metadata: {metadata: true},
        };
        socket.requestResponse(payload).subscribe(subscriber);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        expect(transport.sendOne.mock.frame).toEqual({
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
        transport.receive.mock.publisher.onNext(errorFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame);
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
        expect(error.message).toBe('RSocket: The connection was closed.');
      });

      // open -> transport.close() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        socket.requestResponse(payload).subscribe(subscriber);
        transport.mock.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocket: The connection was closed.');
      });

      // open -> transport.error() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        const error = new Error('wtf');
        socket.requestResponse(payload).subscribe(subscriber);
        transport.mock.closeWithError(error);
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
        expect(transport.sendOne.mock.calls.length).toBe(0);
        expect(transport.send.mock.calls.length).toBe(0);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      // waiting -> request() -> open (requests)
      it('sends a request frame on the first request', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        ({socket, transport} = createSocket(JsonSerializers));
        payload = {
          data: {data: true},
          metadata: {metadata: true},
        };
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        expect(transport.sendOne.mock.calls.length).toBe(0);
        expect(transport.send.mock.calls.length).toBe(0);
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
        transport.receive.mock.publisher.onNext(errorFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
      });

      // open -> response.next() -> response.next/complete() -> closed
      it('publishes and completes when next+completed payloads are received', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        expect(subscriber.onComplete.mock.calls.length).toBe(0);

        const responseFrame2 = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame2);
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
        transport.receive.mock.publisher.onNext(responseFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame2);
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
        transport.mockClear();
        subscriber.mock.request(43);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        transport.mockClear();
        subscriber.mock.request(MAX_REQUEST_N);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        transport.mockClear();
        subscriber.mock.cancel();
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.CANCEL,
          flags: 0,
          streamId: 1,
        });
      });

      // open -> client.close() -> closed (errors)
      it('errors if the socket is closed', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        client.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocket: The connection was closed.');
      });

      // open -> socket.close() -> closed (errors)
      it('errors if the socket is closed', () => {
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        socket.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocket: The connection was closed.');
      });

      // waiting -> transport.error() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        const error = new Error('wtf');
        socket.requestStream(payload).subscribe(subscriber);
        transport.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });

      // open -> transport.error() -> closed (errors)
      it('errors if the connection terminates with an error after requesting data', () => {
        const error = new Error('wtf');
        socket.requestStream(payload).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });
    });

    describe('requestChannel()', () => {
      beforeEach(() => {
        // don't automatically `request` data in onSubscribe
        subscriber = genMockSubscriber();
      });

      // -> waiting
      it('does not immediately send any frames', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        expect(transport.sendOne.mock.calls.length).toBe(0);
        expect(transport.send.mock.calls.length).toBe(0);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      // waiting -> request() -> open (requests)
      it('sends a request frame on the first request', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_CHANNEL,
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
        ({socket, transport} = createSocket(JsonSerializers));
        payload = {
          data: {data: true},
          metadata: {metadata: true},
        };
        payloads = Flowable.just(payload, payload);
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_CHANNEL,
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
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(MAX_REQUEST_N);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.REQUEST_CHANNEL,
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
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.cancel();
        expect(transport.sendOne.mock.calls.length).toBe(0);
        expect(transport.send.mock.calls.length).toBe(0);
      });

      // open -> response.error() -> closed (errors)
      it('errors when an error payload is received', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        const errorFrame = {
          code: 0x00000201, // application error
          flags: 0,
          type: FRAME_TYPES.ERROR,
          message: '<error>',
          streamId: 1,
        };
        transport.receive.mock.publisher.onNext(errorFrame);
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
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
      });

      // open -> response.next() -> response.next/complete() -> closed
      it('publishes and completes when next+completed payloads are received', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        expect(subscriber.onComplete.mock.calls.length).toBe(0);

        const responseFrame2 = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.COMPLETE | FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame2);
        expect(subscriber.onNext.mock.calls.length).toBe(2);
        const response = subscriber.onNext.mock.calls[1][0];
        expect(response.data).toBe(responseFrame2.data);
        expect(response.metadata).toBe(responseFrame2.metadata);
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
      });

      // open -> response.next() -> open (publishes)
      it('publishes when a next/non-completed payload is received', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame);
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const response = subscriber.onNext.mock.calls[0][0];
        expect(response.data).toBe(responseFrame.data);
        expect(response.metadata).toBe(responseFrame.metadata);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> response.next() (2x) -> open (publishes)
      it('publishes multiple next/non-completed payloads', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        const responseFrame = {
          streamId: 1,
          type: FRAME_TYPES.PAYLOAD,
          flags: FLAGS.NEXT,
          data: '{}',
          metadata: '{}',
        };
        transport.receive.mock.publisher.onNext(responseFrame);
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
        transport.receive.mock.publisher.onNext(responseFrame2);
        expect(subscriber.onNext.mock.calls.length).toBe(2);
        const response2 = subscriber.onNext.mock.calls[1][0];
        expect(response2.data).toBe(responseFrame2.data);
        expect(response2.metadata).toBe(responseFrame2.metadata);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      // open -> request() -> open (requests)
      it('sends a request n frame on subsequent requests', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        subscriber.mock.request(43);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        subscriber.mock.request(MAX_REQUEST_N);
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
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
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        subscriber.mock.cancel();
        expect(transport.sendOne.mock.calls.length).toBe(1);
        expect(transport.sendOne.mock.frame).toEqual({
          type: FRAME_TYPES.CANCEL,
          flags: 0,
          streamId: 1,
        });
      });

      //TODO: I couldn't seem to intercept the subscription in a way that kept the underlying
      //TODO: flowable happy - circumventing its _pending check was proving impossible
      //TODO: I have an integration test that uses channels and proved out that things work
      //TODO: but obviously unit test coverage would be preferable. Looking for help with this!
      // open -> response.next/complete() -> closed
      // it('delivers more payloads on requests from server', () => {
      //   ({socket, transport} = createSocket(JsonSerializers));
      //   let payloadSubscriber;
      //   //Capture the payload subscription so we can forcibly invoke it
      //   payloads = Flowable.just(payload, payload, payload).lift(subscriber => {
      //     console.log("lifting subscriber into mock");
      //     console.log(JSON.stringify(subscriber));
      //     payloadSubscriber = genMockSubscriber(subscriber);
      //     return payloadSubscriber;
      //   });
      //   socket.requestChannel(payloads).subscribe(subscriber);
      //   console.log("Requesting 1 from Server");
      //   subscriber.mock.request(1);
      //   console.log("Requesting 1 from Client");
      //   payloadSubscriber.mock.request(1);
      //   const payloadFrame = {
      //     streamId: 1,
      //     type: FRAME_TYPES.PAYLOAD,
      //     flags: FLAGS.NEXT | FLAGS.METADATA,
      //     data: '{"data":true}',
      //     metadata: '{"metadata":true}',
      //   };
      //   expect(transport.sendOne.mock.calls.length).toBe(2);
      //   expect(transport.sendOne.mock.frame).toEqual(payloadFrame);
      //   console.log("Requesting 1 from Client");
      //   payloadSubscriber.mock.request(1);
      //   const payloadAndCompleteFrame = {
      //     streamId: 1,
      //     type: FRAME_TYPES.PAYLOAD,
      //     flags: FLAGS.NEXT | FLAGS.METADATA | FLAGS.COMPLETE,
      //     data: '{"data":true}',
      //     metadata: '{"metadata":true}',
      //   };
      //   expect(transport.sendOne.mock.calls.length).toBe(3);
      //   expect(transport.sendOne.mock.frame).toEqual(payloadAndCompleteFrame);
      // });

      // open -> client.close() -> closed (errors)
      it('errors if the socket is closed', () => {
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mockClear();
        client.close();
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe('RSocket: The connection was closed.');
      });

      // waiting -> transport.error() -> closed (errors)
      it('errors if the connection terminates with an error', () => {
        const error = new Error('wtf');
        socket.requestChannel(payloads).subscribe(subscriber);
        transport.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });

      // open -> transport.error() -> closed (errors)
      it('errors if the connection terminates with an error after requesting data', () => {
        const error = new Error('wtf');
        socket.requestChannel(payloads).subscribe(subscriber);
        subscriber.mock.request(42);
        transport.mock.closeWithError(error);
        jest.runAllTimers();
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0]).toBe(error);
      });
    });

    describe('metadataPush()', () => {});

    describe('client.close()', () => {
      let transport;
      let socket;
      let status;

      beforeEach(() => {
        transport = genMockConnection();
        client = new RSocketClient({
          setup: {
            dataMimeType: '<dataMimeType>',
            keepAlive: 1000,
            lifetime: 10000,
            metadataMimeType: '<metadataMimeType>',
          },
          transport,
        });
        client.connect().subscribe({
          onComplete: (socket) => {
            socket.connectionStatus().subscribe({
              onNext: (_status) => (status = _status),
              onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
            });
          },
        });
      });

      it('cancels the transport if not yet connected', () => {
        client.close();
        expect(transport.close).toBeCalled();
      });

      it('closes the socket and transport if already connected', () => {
        transport.mock.connect();
        client.close();
        jest.runOnlyPendingTimers();
        expect(transport.close).toBeCalled();
        expect(status.kind).toBe('CLOSED');
      });
    });

    describe('socket.close()', () => {
      let transport;
      let resolve;
      let socket;
      let status;

      beforeEach(() => {
        transport = genMockConnection();
        client = new RSocketClient({
          setup: {
            dataMimeType: '<dataMimeType>',
            keepAlive: 1000,
            lifetime: 10000,
            metadataMimeType: '<metadataMimeType>',
          },
          transport,
        });
        client.connect().subscribe({
          onComplete: (_socket) => {
            socket = _socket;
            socket.connectionStatus().subscribe({
              onNext: (_status) => (status = _status),
              onSubscribe: (sub) => sub.request(Number.MAX_SAFE_INTEGER),
            });
          },
        });
        transport.mock.connect();
      });

      it('closes the underlying socket', () => {
        socket.close();
        jest.runOnlyPendingTimers();
        expect(transport.close).toBeCalled();
        expect(status.kind).toBe('CLOSED');
      });
    });

    describe('connectionStatus()', () => {
      it('returns the transport status', () => {
        const transport = genMockConnection();
        let socket;
        const client = new RSocketClient({
          setup: {
            dataMimeType: '<dataMimeType>',
            keepAlive: 1000,
            lifetime: 10000,
            metadataMimeType: '<metadataMimeType>',
          },
          transport,
        });
        client.connect().subscribe({
          onComplete: (_socket) => {
            socket = _socket;
          },
        });
        transport.mock.connect();
        expect(socket.connectionStatus()).toBe(transport.connectionStatus());
      });
    });
  });
});
