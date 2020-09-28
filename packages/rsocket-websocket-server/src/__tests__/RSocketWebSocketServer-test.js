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

jest.mock('net').useFakeTimers();

describe('RSocketWebSocketServer', () => {
  // `import` and jest mocks don't seem to play well together
  const ws = require('ws');
  const {
    FRAME_TYPES,
    deserializeFrameWithLength,
    serializeFrameWithLength,
  } = require('rsocket-core');
  const RSocketWebSocketServer = require('../RSocketWebSocketServer').default;
  const EventEmitter = require('events');

  beforeEach(() => {
    jest.clearAllTimers();
  });

  describe('connectionStatus() and connect()', () => {
    let emitter;
    let connection;
    let server;
    let status;

    beforeEach(() => {
      emitter = new EventEmitter();
      emitter.close = () => {};
      emitter.error = () => {};
      server = new RSocketWebSocketServer({port: 8080});
      server.start().subscribe(_connection => (connection = _connection));
      ws.servers[0].emit('connection', emitter);
      connection.connectionStatus().subscribe({
        onNext: _status => (status = _status),
        onSubscribe: subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER),
      });
    });

    it('initially returns CONNECTED', () => {
      expect(status.kind).toBe('CONNECTED');
    });

    it('initially returns NOT_CONNECTED if socket is null', () => {
      ws.servers[0].emit('connection', null);
      connection.connectionStatus().subscribe({
        onNext: _status => (status = _status),
        onSubscribe: subscription =>
          subscription.request(Number.MAX_SAFE_INTEGER),
      });
      expect(status.kind).toBe('NOT_CONNECTED');
    });

    it('returns ERROR if the socket errors', () => {
      connection.receive().subscribe(() => {});
      const error = new Error('wtf');
      emitter.emit('error', error);
      expect(status.kind).toBe('ERROR');
      expect(status.error).toBe(error);
    });

    it('returns CLOSED if explicitly closed', () => {
      connection.receive().subscribe(() => {});
      connection.close();
      expect(status.kind).toBe('CLOSED');
    });
  });
});
