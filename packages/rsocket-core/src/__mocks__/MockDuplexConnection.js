/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

import Deferred from 'fbjs/lib/Deferred';
import {genMockPublisher} from 'MockFlowableSubscription';

/**
 * Creates an object implementing the DuplexConnection interface.
 */
export function genMockConnection() {
  const deferred = new Deferred();
  const receiver = genMockPublisher();

  const connection = {
    close: jest.fn(() => {
      deferred.resolve();
    }),
    onClose: jest.fn(() => {
      return deferred.getPromise();
    }),
    receive: jest.fn(() => receiver),
    send: jest.fn(frames => {
      connection.send.mock.frames = frames;
    }),
    sendOne: jest.fn(frame => {
      connection.sendOne.mock.frame = frame;
    }),
  };
  connection.receive.mock.publisher = receiver;

  // Convenience methods to terminate the connection
  connection.mock = {
    close: () => {
      receiver.onComplete();
      deferred.resolve();
    },
    closeWithError: error => {
      receiver.onError(error);
      deferred.resolve();
    },
  };

  // Convenience to call mockClear() on all instance methods
  connection.mockClear = () => {
    connection.send.mockClear();
    connection.sendOne.mockClear();
    connection.receive.mockClear();
    connection.receive.mock.publisher = receiver;
    connection.close.mockClear();
  };
  return connection;
}
