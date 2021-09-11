import * as net from "net";
import sinon from "sinon";
import { mock } from "jest-mock-extended";
import EventEmitter from "events";
import {
  Demultiplexer,
  Deserializer,
  Flags,
  FrameHandler,
  FrameTypes,
  Multiplexer,
  serializeFrameWithLength,
  SetupFrame,
} from "@rsocket/rsocket-core";
import { MockSocket } from "../__mocks__/net";
import { TcpDuplexConnection } from "../TcpDuplexConnection";

describe("TcpDuplexConnection", function () {
  describe("when closed", () => {
    it("removes listeners from the underlying socket event emitter", async () => {
      // arrange
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );

      connection.close();

      expect(socketStub.off.calledWith("close")).toBe(true);
      expect(socketStub.off.calledWith("error")).toBe(true);
      expect(socketStub.off.calledWith("data")).toBe(true);
    });

    it("cleans up the socket resource when closed without an error", async () => {
      // arrange
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );

      connection.close();

      expect(socketStub.end.calledWith()).toBe(true);
    });

    it("cleans up the socket resource when closed with an error", async () => {
      // arrange
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );

      const error = new Error();
      connection.close(error);

      expect(socketStub.end.calledWith()).toBe(true);
    });

    it("calls onClose", async () => {
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      connection.onClose(onCloseCallback);
      connection.close();

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith();
    });

    it("calls onClose when closed with an error", async () => {
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error();

      connection.onClose(onCloseCallback);
      connection.close(error);

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith(error);
    });

    it("subsequent calls to close do not invoke onClose", async () => {
      const socketStub = sinon.createStubInstance(net.Socket);
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error();
      connection.onClose(onCloseCallback);
      connection.close(error);
      connection.close(error);

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith(error);
    });

    it("the onClose callback is called with an error when the socket is closed unexpectedly", async () => {
      const socket = new net.Socket();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socket,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      connection.onClose(onCloseCallback);
      socket.emit("close");

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toHaveBeenCalledWith(
        new Error("TcpDuplexConnection: Socket closed unexpectedly.")
      );
    });

    it("the onClose callback is called with an error when the socket is closed with an error", async () => {
      const socket = new net.Socket();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socket,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error("Test error 1");
      const expectedError = new Error("TcpDuplexConnection: Test error 1");

      connection.onClose(onCloseCallback);
      socket.emit("error", error);
      socket.emit("close", true);

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toHaveBeenCalledWith(expectedError);
    });
  });

  describe("send()", () => {
    const setupFrame = {
      type: FrameTypes.SETUP,
      dataMimeType: "application/octet-stream",
      metadataMimeType: "application/octet-stream",
      keepAlive: 60000,
      lifetime: 300000,
      metadata: Buffer.from("hello world"),
      data: Buffer.from("hello world"),
      resumeToken: null,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 0,
      flags: Flags.METADATA,
    } as SetupFrame;
    const multiplexerDemultiplexer = mock<
      Multiplexer & Demultiplexer & FrameHandler
    >();

    it("serializes and writes the given frame to the underlying socket", async () => {
      // arrange
      const socketStub = mock<net.Socket>();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );

      // act
      connection.send(setupFrame);

      // assert
      expect(socketStub.write).toBeCalledWith(expect.any(Buffer));
    });

    it("does not write the given frame to the underlying socket when close was previously called", async () => {
      // arrange
      const socketStub = mock<net.Socket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new TcpDuplexConnection(
        socketStub,
        new Deserializer(),
        () => multiplexerDemultiplexer
      );

      // act
      connection.close();
      connection.send(setupFrame);

      // assert
      expect(socketStub.write).toBeCalledTimes(0);
    });
  });

  describe("when receiving data", () => {
    const setupFrame = {
      type: FrameTypes.SETUP,
      dataMimeType: "application/octet-stream",
      metadataMimeType: "application/octet-stream",
      keepAlive: 60000,
      lifetime: 300000,
      metadata: Buffer.from("hello world"),
      data: Buffer.from("hello world"),
      resumeToken: null,
      streamId: 0,
      majorVersion: 1,
      minorVersion: 0,
      flags: Flags.METADATA,
    } as SetupFrame;

    describe("when buffer contains a single frame", () => {
      it("deserializes received frames and calls the configured handler", () => {
        // arrange
        const handler = mock<Multiplexer & Demultiplexer & FrameHandler>();
        const socketStub = new EventEmitter() as net.Socket;
        const connection = new TcpDuplexConnection(
          socketStub,
          new Deserializer(),
          () => handler
        );

        // act
        socketStub.emit("data", serializeFrameWithLength(setupFrame));

        // assert
        expect(handler.handle).toBeCalledTimes(1);

        const [call0] = handler.handle.mock.calls;
        const [arg0] = call0;
        expect(arg0).toMatchSnapshot();
      });
    });

    describe("when buffer contains multiple frames", () => {
      it("deserializes received frames and calls the configured handler for each frame", () => {
        // arrange
        const multiplexerDemultiplexer = mock<
          Multiplexer & Demultiplexer & FrameHandler
        >();
        const socketStub = new EventEmitter() as net.Socket;
        const connection = new TcpDuplexConnection(
          socketStub,
          new Deserializer(),
          () => multiplexerDemultiplexer
        );

        // act
        socketStub.emit(
          "data",
          Buffer.concat([
            serializeFrameWithLength({
              type: FrameTypes.PAYLOAD,
              flags: Flags.NEXT,
              data: Buffer.from("hello world"),
              metadata: undefined,
              streamId: 1,
            }),
            serializeFrameWithLength({
              type: FrameTypes.PAYLOAD,
              flags: Flags.NEXT,
              data: Buffer.from("hello world 2"),
              metadata: undefined,
              streamId: 1,
            }),
          ])
        );

        // assert
        expect(multiplexerDemultiplexer.handle).toBeCalledTimes(2);

        const [call0, call1] = multiplexerDemultiplexer.handle.mock.calls;

        expect(call0).toMatchSnapshot();
        expect(call1).toMatchSnapshot();
      });
    });

    describe("causes an error", () => {
      it("the connection is closed", () => {
        // arrange
        const socketStub = new MockSocket();
        const multiplexerDemultiplexer = mock<
          Multiplexer & Demultiplexer & FrameHandler
        >();
        const deserializerStub = mock<Deserializer>();
        const connection = new TcpDuplexConnection(
          (socketStub as unknown) as net.Socket,
          deserializerStub,
          () => multiplexerDemultiplexer
        );
        deserializerStub.deserializeFrames.mockImplementation(() => {
          throw new Error("Mock error");
        });
        const onCloseCallback = jest.fn();
        const data = Buffer.allocUnsafe(0);

        // act
        connection.onClose(onCloseCallback);
        socketStub.mock.data(data);

        // assert
        expect(onCloseCallback).toBeCalledTimes(1);
        expect(onCloseCallback).toBeCalledWith(expect.any(Error));
      });
    });
  });
});
