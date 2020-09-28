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
  CONNECTION_STREAM_ID,
} from '../RSocketFrame';
import RSocketServer from '../RSocketServer';
import {JsonSerializers} from '../RSocketSerialization';
import {genMockConnection} from 'MockDuplexConnection';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import {genMockPublisher} from 'MockFlowableSubscription';
import {Single, Flowable} from 'rsocket-flowable';

jest.useFakeTimers();

describe('RSocketServer', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  let connection;

  function genMockTransportServer() {
    const publisher = genMockPublisher();
    return {
      mock: {
        connect() {
          connection = genMockConnection();
          publisher.onNext(connection);
          return connection;
        },
      },
      start: jest.fn(() => publisher),
      stop: jest.fn(),
    };
  }

  describe('start()', () => {
    it('calls start() on the transport server', () => {
      const transport = genMockTransportServer();
      const server = new RSocketServer({
        getRequestHandler: jest.fn(),
        serializers: JsonSerializers,
        transport,
      });
      server.start();
      expect(transport.start.mock.calls.length).toBe(1);
    });

    it('throws if started again', () => {
      const transport = genMockTransportServer();
      const server = new RSocketServer({
        getRequestHandler: jest.fn(),
        serializers: JsonSerializers,
        transport,
      });
      server.start();
      expect(() => server.start()).toThrow();
    });
  });

  describe('RequestHandler', () => {
    it('sends error if getRequestHandler throws', () => {
      const transport = genMockTransportServer();
      const server = new RSocketServer({
        getRequestHandler: () => {
          throw new Error('No like');
        },
        transport,
      });
      server.start();
      transport.mock.connect();
      connection.receive.mock.publisher.onNext({
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
        minorVersion: 0,
      });
      expect(connection.close.mock.calls.length).toBe(1);
      expect(connection.sendOne.mock.calls.length).toBe(1);
      expect(connection.sendOne.mock.frame).toEqual({
        code: ERROR_CODES.REJECTED_SETUP,
        flags: 0,
        message: 'Application rejected setup, reason: No like',
        streamId: CONNECTION_STREAM_ID,
        type: FRAME_TYPES.ERROR,
      });
    });

    it('sends error if request handler throws', () => {
      console.error = jest.fn();
      const transport = genMockTransportServer();
      const server = new RSocketServer({
        getRequestHandler: () => {
          return {
            requestResponse: () => {
              throw new Error('No like');
            },
          };
        },
        transport,
      });
      server.start();
      transport.mock.connect();
      connection.receive.mock.publisher.onNext({
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
        minorVersion: 0,
      });
      jest.runOnlyPendingTimers();
      connection.receive.mock.publisher.onNext({
        type: FRAME_TYPES.REQUEST_RESPONSE,
        data: undefined,
        dataMimeType: '<dataMimeType>',
        flags: 0,
        metadata: undefined,
        metadataMimeType: '<metadataMimeType>',
        streamId: 1,
      });
      expect(connection.sendOne.mock.calls.length).toBe(1);
      expect(connection.sendOne.mock.frame).toEqual({
        code: ERROR_CODES.APPLICATION_ERROR,
        flags: 0,
        message: 'No like',
        streamId: 1,
        type: FRAME_TYPES.ERROR,
      });
      expect(console.error).toHaveBeenCalled();
    });

    it('call subscription.cancel() for all active subscriptions', () => {
      let cancelled = false;
      const transport = genMockTransportServer();
      const server = new RSocketServer({
        getRequestHandler: () => {
          return {
            requestStream: () => {
              return new Flowable((subscriber) => {
                subscriber.onSubscribe({
                  cancel: () => {
                    cancelled = true;
                  },
                  request: (n) => {},
                });
              });
            },
          };
        },
        transport,
      });
      server.start();
      transport.mock.connect();
      connection.receive.mock.publisher.onNext({
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
        minorVersion: 0,
      });
      jest.runOnlyPendingTimers();
      connection.receive.mock.publisher.onNext({
        type: FRAME_TYPES.REQUEST_STREAM,
        data: undefined,
        dataMimeType: '<dataMimeType>',
        flags: 0,
        metadata: undefined,
        metadataMimeType: '<metadataMimeType>',
        streamId: 1,
        requestN: 1,
      });
      connection.close();
      expect(cancelled).toBeTruthy();
    });
  });
});
