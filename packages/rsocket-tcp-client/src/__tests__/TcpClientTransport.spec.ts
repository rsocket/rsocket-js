import { TcpClientTransport } from "../index";
import { TcpDuplexConnection } from "../TcpDuplexConnection";
import * as net from "net";
import sinon from "sinon";
import EventEmitter from "events";

describe("TcpClientTransport", function () {
  describe("connect", () => {
    it("resolves to an instance of DuplexConnection on successful connection", async () => {
      // arrange
      const netStub = new EventEmitter();
      const socketStub = sinon.createStubInstance(net.Socket);

      const transport = new TcpClientTransport({
        connectionOptions: {
          host: "localhost",
          port: 9090,
        },
        // @ts-ignore
        socketCreator: () => {
          return netStub;
        },
      });

      // act
      const connectionPromise = transport.connect();

      netStub.emit("connect", socketStub);

      // assert
      await expect(connectionPromise).resolves.toBeInstanceOf(
        TcpDuplexConnection
      );
    });

    it("rejects if the connection cannot be established", async () => {
      // arrange
      const connectionRefusedError = new Error();
      // @ts-ignore
      connectionRefusedError.address = "127.0.0.1";
      // @ts-ignore
      connectionRefusedError.code = "ECONNREFUSED";
      // @ts-ignore
      connectionRefusedError.errno = -4078;
      // @ts-ignore
      connectionRefusedError.port = 9090;
      // @ts-ignore
      connectionRefusedError.syscall = "connect";

      const socketStub = new EventEmitter();

      const transport = new TcpClientTransport({
        connectionOptions: {
          host: "localhost",
          port: 9090,
        },
        // @ts-ignore
        socketCreator: () => {
          return socketStub;
        },
      });

      // act
      const connectionPromise = transport.connect();

      socketStub.emit("error", connectionRefusedError);

      // assert
      await expect(connectionPromise).rejects.toEqual(connectionRefusedError);
    });
  });
});
