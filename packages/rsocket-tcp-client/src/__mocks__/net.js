/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

'use strict';

const EventEmitter = require('events');

class MockSocket extends EventEmitter {
  end = jest.fn(() => {
    // 'end' is only emitted when a FIN packet is received
    this.emit('close');
  });

  write = jest.fn();
}

const connect = jest.fn(() => {
  const socket = new MockSocket();
  connect.socket = socket; // for easy accessibility in tests
  return socket;
});

module.exports = {connect};
