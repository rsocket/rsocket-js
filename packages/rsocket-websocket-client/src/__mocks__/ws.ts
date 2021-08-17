import { CloseEvent, ErrorEvent, MessageEvent } from "ws";

const EventEmitter = require("events");

export class MockSocket extends EventEmitter {
  send = jest.fn();

  close = jest.fn();

  addEventListener = (name, handler) => {
    this.on(name, handler);
  };

  removeEventListener = (name, handler) => {
    this.on(name, handler);
  };

  mock = {
    close: (event: Partial<CloseEvent>) => {
      this.emit("close", event);
    },
    open: () => {
      this.emit("connect");
    },
    message: (message: Partial<MessageEvent>) => {
      this.emit("message", message);
    },
    error: (event: Partial<ErrorEvent>) => {
      this.emit("error", event);
    },
  };
}
