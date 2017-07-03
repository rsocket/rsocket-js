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
  const status = genMockPublisher();
  let closed = false;

  const connection = {
    close: jest.fn(() => {
      connection.mock.close();
    }),
    connect: jest.fn(),
    connectionStatus: jest.fn(() => status),
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
      if (closed) {
        return;
      }
      closed = true;
      receiver.onComplete();
      status.onNext({kind: 'CLOSED'});
      deferred.resolve();
    },
    closeWithError: error => {
      if (closed) {
        return;
      }
      closed = true;
      receiver.onError(error);
      status.onNext({
        error,
        kind: 'ERROR',
      });
      deferred.reject(error);
    },
    connect: () => {
      if (closed) {
        return;
      }
      status.onNext({kind: 'CONNECTING'});
      status.onNext({kind: 'CONNECTED'});
    },
    connecting: () => {
      if (closed) {
        return;
      }
      status.onNext({kind: 'CONNECTING'});
    },
    receiver,
  };

  // Convenience to call mockClear() on all instance methods
  connection.mockClear = () => {
    connection.close.mockClear();
    connection.connect.mockClear();
    connection.onClose.mockClear();
    connection.receive.mockClear();
    connection.receive.mock.publisher = receiver;
    connection.send.mockClear();
    connection.sendOne.mockClear();
  };
  return connection;
}
