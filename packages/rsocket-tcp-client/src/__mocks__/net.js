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

  mock = {
    close: () => {
      this.emit('close');
    },
    connect: () => {
      this.emit('connect');
    },
    data: data => {
      this.emit('data', data);
    },
    error: error => {
      this.emit('error', error);
    },
  };
}

const net = {
  connect: jest.fn(() => {
    const socket = new MockSocket();
    net.socket = socket; // for easy accessibility in tests
    return socket;
  }),
  socket: null,
};

module.exports = net;
