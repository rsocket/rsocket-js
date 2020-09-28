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

    close: (reason) => {
      this._emitter.emit('close', {reason});
    },

    error: (error) => {
      this._emitter.emit('error', {error});
    },

    message: (data) => {
      this._emitter.emit('message', {data});
    },
  };
}

global.WebSocket = WebSocket;
