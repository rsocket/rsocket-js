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

import {genMockPublisher} from 'MockFlowableSubscription';

/**
 * Creates an object implementing the DuplexConnection interface.
 */
export function genMockConnection() {
  const receiver = genMockPublisher();
  const status = genMockPublisher();
  let closed = false;
  let resolveFun = undefined;
  let rejectFun = undefined;
  let result = undefined;
  let errorRes = undefined;

  const connection = {
    close: jest.fn(() => {
      connection.mock.close();
    }),
    connect: jest.fn(),
    connectionStatus: jest.fn(() => status),
    onClose: jest.fn(() => {
      return new Promise((resolve, reject) => {
        if (errorRes) {
          reject(errorRes);
        } else if (result) {
          resolve(result);
        } else {
          resolveFun = resolve;
          rejectFun = reject;
        }
      });
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
      if (resolveFun) {
        resolveFun();
      } else {
        result = {};
      }
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
      if (rejectFun) {
        rejectFun(error);
      } else {
        errorRes = error;
      }
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
