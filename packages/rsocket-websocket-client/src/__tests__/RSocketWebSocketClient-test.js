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

/* eslint-env browser */

jest.useFakeTimers();

import {FRAME_TYPES, deserializeFrame, serializeFrame} from 'rsocket-core';
import {genMockPublisher} from 'MockFlowableSubscription';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import RSocketWebSocketClient from '../RSocketWebSocketClient';

describe('RSocketWebSocketClient', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('connectionStatus() and connect()', () => {
    let client;
    let status;

    beforeEach(() => {
      client = new RSocketWebSocketClient({url: 'wss://...'});
      client.connectionStatus().subscribe({
        onNext: _status => (status = _status),
        onSubscribe: subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER),
      });
    });

    it('initially returns NOT_CONNECTED', () => {
      expect(status.kind).toBe('NOT_CONNECTED');
    });

    it('returns CONNECTING while connecting', () => {
      client.connect();
      expect(status.kind).toBe('CONNECTING');
    });

    it('returns CONNECTED once connected', () => {
      client.connect();
      WebSocket.socket.mock.open();
      expect(status.kind).toBe('CONNECTED');
    });

    it('returns ERROR if the socket errors', () => {
      client.connect();
      WebSocket.socket.mock.error(new Error('oopsie'));
      expect(status.kind).toBe('ERROR');
      expect(status.error.message).toBe('oopsie');
    });

    it('returns CLOSED if explicitly closed', () => {
      client.connect();
      client.close();
      expect(status.kind).toBe('CLOSED');
    });
  });

  describe('post-connect() APIs', () => {
    let client;
    let socket;

    const frame = {
      data: null,
      flags: 0,
      lastReceivedPosition: 0,
      streamId: 0,
      type: FRAME_TYPES.KEEPALIVE,
    };

    beforeEach(() => {
      client = new RSocketWebSocketClient({url: 'wss://...'});
      client.connect();
      jest.runAllTimers();
      socket = WebSocket.socket;
      socket.mock.open();
      jest.runAllTimers();
    });

    describe('close()', () => {
      it('closes the socket', () => {
        client.close();
        expect(socket.close.mock.calls.length).toBe(1);
      });

      it('sets the status to CLOSED', () => {
        let status;
        client.connectionStatus().subscribe({
          onNext: _status => (status = _status),
          onSubscribe: subscription =>
            subscription.request(Number.MAX_SAFE_INTEGER),
        });
        client.close();
        expect(status.kind).toBe('CLOSED');
      });

      it('calls receive.onComplete', () => {
        const onComplete = jest.fn();
        const onSubscribe = subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER);
        client.receive().subscribe({onComplete, onSubscribe});
        client.close();
        expect(onComplete.mock.calls.length).toBe(1);
      });
    });

    describe('sendOne()', () => {
      it('sends a frame', () => {
        client.sendOne(frame);
        expect(socket.send.mock.calls.length).toBe(1);
        const buffer = socket.send.mock.calls[0][0];
        expect(deserializeFrame(buffer)).toEqual({
          ...frame,
          length: buffer.length,
        });
      });

      it('calls receive.onError if the frame cannot be sent', () => {
        const onError = jest.fn();
        const onSubscribe = subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER);
        client.receive().subscribe({onError, onSubscribe});
        socket.send = () => {
          throw new Error('wtf');
        };
        client.sendOne(frame);
        expect(onError.mock.calls.length).toBe(1);
      });
    });

    describe('send()', () => {
      it('sends frames', () => {
        const frame2 = {...frame, flags: 1};
        const publisher = genMockPublisher();
        client.send(publisher);
        publisher.onNext(frame);
        publisher.onNext(frame2);
        expect(socket.send.mock.calls.length).toBe(2);
        const buffer = socket.send.mock.calls[0][0];
        expect(deserializeFrame(buffer)).toEqual({
          ...frame,
          length: buffer.length,
        });
        const buffer2 = socket.send.mock.calls[1][0];
        expect(deserializeFrame(buffer2)).toEqual({
          ...frame2,
          length: buffer2.length,
        });
      });

      it('calls receive.onError if frames cannot be sent', () => {
        const onError = jest.fn();
        const onSubscribe = subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER);
        client.receive().subscribe({onError, onSubscribe});
        socket.send = () => {
          throw new Error('wtf');
        };
        const publisher = genMockPublisher();
        client.send(publisher);
        publisher.onNext(frame);
        expect(onError.mock.calls.length).toBe(1);
      });

      it('unsubscribes when closed', () => {
        const publisher = genMockPublisher();
        client.send(publisher);
        client.close();
        expect(publisher.cancel).toBeCalled();
      });
    });

    describe('receive()', () => {
      it('calls onNext with deserialized frames', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        client.receive().subscribe(subscriber);
        expect(subscriber.onNext.mock.calls.length).toBe(0);

        socket.mock.message(serializeFrame(frame));
        expect(subscriber.onNext.mock.calls.length).toBe(1);
        const nextFrame = subscriber.onNext.mock.calls[0][0];
        expect(nextFrame).toEqual({...frame, length: nextFrame.length});

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(0);
      });

      it('calls onError when partial frames are received', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        client.receive().subscribe(subscriber);

        const buffer = serializeFrame(frame);
        socket.mock.message(buffer.slice(0, 2));
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
      });

      it('calls onComplete when intentionally close()-ed', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        client.receive().subscribe(subscriber);
        client.close();
        expect(subscriber.onComplete.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls.length).toBe(0);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('calls onError when the socket is closed by the peer', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        client.receive().subscribe(subscriber);
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
        client.receive().subscribe(subscriber);
        // Emit a frame of length one, which is shorter than the smallest
        // possible frame (3 bytes of length, 1 byte of payload).
        const buffer = new Buffer([0x00, 0x00, 0x01, 0x00]);
        socket.mock.message(buffer);

        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });

      it('calls onError when a socket error occurs', () => {
        const subscriber = genMockSubscriber({
          onSubscribe(subscription) {
            subscription.request(Number.MAX_SAFE_INTEGER);
          },
        });
        client.receive().subscribe(subscriber);
        socket.mock.error(new Error('oops'));
        expect(subscriber.onComplete.mock.calls.length).toBe(0);
        expect(subscriber.onError.mock.calls.length).toBe(1);
        expect(subscriber.onError.mock.calls[0][0].message).toBe('oops');
        expect(subscriber.onNext.mock.calls.length).toBe(0);
      });
    });
  });
});
