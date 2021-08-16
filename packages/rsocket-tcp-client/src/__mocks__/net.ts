const EventEmitter = require("events");

export class MockSocket extends EventEmitter {
  end = jest.fn(() => {
    // 'end' is only emitted when a FIN packet is received
    this.emit("close");
  });

  write = jest.fn();

  mock = {
    close: () => {
      this.emit("close");
    },
    connect: () => {
      this.emit("connect");
    },
    data: (data) => {
      this.emit("data", data);
    },
    error: (error) => {
      this.emit("error", error);
    },
  };

  destroy() {}
}

export const net = {
  connect: jest.fn(() => {
    const socket = new MockSocket();
    net.socket = socket; // for easy accessibility in tests
    return socket;
  }),
  socket: null,
};
