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

class WebSocket {
  constructor() {
    this._emitter = new EventEmitter();

    // Easily access the most-recently created socket
    global.WebSocket.socket = this;
  }

  addEventListener(event, fn) {
    this._emitter.on(event, fn);
  }

  removeEventListener(event, fn) {
    this._emitter.removeListener(event, fn);
  }

  close = jest.fn(() => {
    this._emitter.emit('close');
  });

  send = jest.fn();

  mock = {
    open: () => {
      this._emitter.emit('open');
    },

    close: () => {
      this._emitter.emit('close');
    },

    error: error => {
      this._emitter.emit('error', error);
    },

    message: data => {
      this._emitter.emit('message', {data});
    },
  };
}

global.WebSocket = WebSocket;
