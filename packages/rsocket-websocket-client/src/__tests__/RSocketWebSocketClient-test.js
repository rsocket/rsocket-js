/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

/* eslint-env browser */

jest.useFakeTimers();

import {FRAME_TYPES, deserializeFrame, serializeFrame} from 'rsocket-core';
import {genMockSubscriber} from 'MockSubscriber';
import RSocketWebSocketClient from '../RSocketWebSocketClient';
import {UnicastProcessor} from 'reactor-core-js/flux';

describe('RSocketWebSocketClient', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('connect()', () => {
    it('resolves if the socket opens successfully', () => {
      const client = new RSocketWebSocketClient({url: 'wss://...'});
      const subscriber = genMockSubscriber({
        onSubscribe(subscription) {
          subscription.request(Number.MAX_SAFE_INTEGER);
        },
      });
      client.connect().subscribe(subscriber);
      WebSocket.socket.mock.open();

      expect(subscriber.onComplete.mock.calls.length).toBe(1);
      expect(subscriber.onError.mock.calls.length).toBe(0);
      const connection = subscriber.onNext.mock.calls[0][0];
      expect(typeof connection.close).toBe('function');
      expect(typeof connection.receive).toBe('function');
      expect(typeof connection.send).toBe('function');
      expect(typeof connection.sendOne).toBe('function');
    });

    it('rejects if the socket does not open successfully', () => {
      const client = new RSocketWebSocketClient({url: 'wss://...'});
      const subscriber = genMockSubscriber();
      client.connect().subscribe(subscriber);
      WebSocket.socket.mock.error();

      expect(subscriber.onComplete.mock.calls.length).toBe(0);
      expect(subscriber.onError.mock.calls.length).toBe(1);
      const error = subscriber.onError.mock.calls[0][0];
      expect(error.message).toBe(
        'RSocketWebSocketClient: Failed to open connection to wss://....',
      );
      expect(subscriber.onNext.mock.calls.length).toBe(0);
    });

    it('closes the connection if cancelled', () => {
      const client = new RSocketWebSocketClient({url: 'wss://...'});
      const subscriber = genMockSubscriber();
      client.connect().subscribe(subscriber);
      subscriber.mock.cancel();
      expect(WebSocket.socket.close).toBeCalled();
      WebSocket.socket.mock.open();
      expect(subscriber.onComplete.mock.calls.length).toBe(0);
      expect(subscriber.onError.mock.calls.length).toBe(0);
      expect(subscriber.onNext.mock.calls.length).toBe(0);
    });
  });

  describe('connection', () => {
    let connection;
    let socket;

    const frame = {
      data: null,
      flags: 0,
      lastReceivedPosition: 0,
      streamId: 0,
      type: FRAME_TYPES.KEEPALIVE,
    };

    beforeEach(() => {
      new RSocketWebSocketClient({url: 'wss://...'}).connect().consume(_connection => connection = _connection);
      jest.runAllTimers();
      socket = WebSocket.socket;
      socket.mock.open();
      jest.runAllTimers();
    });

    describe('close()', () => {
      it('closes the socket', () => {
        connection.close();
        expect(socket.close.mock.calls.length).toBe(1);
      });

      it('calls receive.onComplete', () => {
        const onNext = jest.fn();
        const onError = jest.fn();
        const onComplete = jest.fn();
        connection.receive().consume(onNext, onError, onComplete);
        connection.close();
        expect(onComplete.mock.calls.length).toBe(1);
      });
    });

    describe('onClose()', () => {
      it('resolves when close() is called', () => {
        let resolved = false;
        connection.onClose().then(() => resolved = true);

        connection.close();
        jest.runAllTimers();
        expect(resolved).toBe(true);
      });

      it('resolves when the connection closes', () => {
        let resolved = false;
        connection.onClose().then(() => resolved = true);

        socket.mock.close();
        jest.runAllTimers();
        expect(resolved).toBe(true);
      });

      it('resolves when the connection has an error', () => {
        let resolved = false;
        connection.onClose().then(() => resolved = true);

        socket.mock.error();
        jest.runAllTimers();
        expect(resolved).toBe(true);
      });
    });

    describe('sendOne()', () => {
      it('sends a frame', () => {
        connection.sendOne(frame);
        expect(socket.send.mock.calls.length).toBe(1);
        const buffer = socket.send.mock.calls[0][0];
        expect(deserializeFrame(buffer)).toEqual(frame);
      });

      it('calls receive.onError if the frame cannot be sent', () => {
        const onNext = jest.fn();
        const onError = jest.fn();
        connection.receive().consume(onNext, onError);
        socket.send = () => {
          throw new Error('wtf');
        };
        connection.sendOne(frame);
        expect(onError.mock.calls.length).toBe(1);
      });
    });

    describe('send()', () => {
      it('sends frames', () => {
        const frame2 = {...frame, flags: 1};
        const publisher = new UnicastProcessor();
        connection.send(publisher);
        publisher.onNext(frame);
        publisher.onNext(frame2);
        expect(socket.send.mock.calls.length).toBe(2);
        const buffer = socket.send.mock.calls[0][0];
        expect(deserializeFrame(buffer)).toEqual(frame);
        const buffer2 = socket.send.mock.calls[1][0];
        expect(deserializeFrame(buffer2)).toEqual(frame2);
      });

      it('calls receive.onError if frames cannot be sent', () => {
        const onNext = jest.fn();
        const onError = jest.fn();
        connection.receive().consume(onNext, onError);
        socket.send = () => {
          throw new Error('wtf');
        };
        const publisher = new UnicastProcessor();
        connection.send(publisher);
        publisher.onNext(frame);
        expect(onError.mock.calls.length).toBe(1);
      });

      it('unsubscribes when closed', () => {
        const publisher = new UnicastProcessor();
        connection.send(publisher);
        connection.close();
        expect(publisher.cancelled).toBe(true);
      });
    });

    describe('receive()', () => {
      it('calls onNext with deserialized frames', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);
        expect(subscriber.onNext.mock.calls.length).toBe(0);

        socket.mock.message(serializeFrame(frame));
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const nextFrame = subscriber.onNext.mock.calls[0][0];
        expect(nextFrame).toEqual(frame);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      it('calls onError when partial frames are received', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);

        const buffer = serializeFrame(frame);
        socket.mock.message(buffer.slice(0, 2));
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message.toLowerCase()).toBe('index out of range');
      });

      it('calls onComplete when intentionally close()-ed', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);
        connection.close();
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('calls onError when the connection is closed by the peer', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);
        socket.mock.close();
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message).toBe(
          'RSocketWebSocketClient: Socket closed unexpectedly.',
        );
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('calls onError when invalid frames are received', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);
        // Emit a frame of length one, which is shorter than the smallest
        // possible frame (3 bytes of length, 1 byte of payload).
        const buffer = new Buffer([0x00, 0x00, 0x01, 0x00]);
        socket.mock.message(buffer);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        const error = subscriber.onError.mock.calls[0][0];
        expect(error.message.toLowerCase()).toBe('index out of range');
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('calls onError when a connection error occurs', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        connection.receive().subscribe(subscriber);
        socket.mock.error();
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0].message).toBe(
          'RSocketWebSocketClient: Socket closed unexpectedly.',
        );
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });
    });
  });
});
