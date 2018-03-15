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
import RSocketServer from '../RSocketServer';
import {JsonSerializers} from '../RSocketSerialization';
import {genMockConnection} from 'MockDuplexConnection';
import {genMockSubscriber} from 'MockFlowableSubscriber';
import {genMockPublisher} from 'MockFlowableSubscription';
import {Single} from 'rsocket-flowable';

jest.useFakeTimers();

describe('RSocketServer', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  function genMockTransportServer() {
    const publisher = genMockPublisher();
    return {
      mock: {
        connect() {
          const connection = genMockConnection();
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
});
