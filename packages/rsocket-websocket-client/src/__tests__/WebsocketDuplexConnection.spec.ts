import { mock } from "jest-mock-extended";
import {
  Demultiplexer,
  Deserializer,
  Flags,
  FrameHandler,
  FrameTypes,
  Multiplexer,
  serializeFrame,
  SetupFrame,
} from "rsocket-core";
import { WebsocketDuplexConnection } from "../WebsocketDuplexConnection";
import { MockSocket } from "../__mocks__/ws";

const deserializer = mock<Deserializer>();

describe("WebsocketDuplexConnection", function () {
  describe("when closed", () => {
    it("removes listeners from the underlying socket event emitter", () => {
      // arrange
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );

      connection.close();

      expect(socketStub.removeEventListener).toBeCalledWith(
        "close",
        expect.any(Function)
      );
      expect(socketStub.removeEventListener).toBeCalledWith(
        "error",
        expect.any(Function)
      );
      expect(socketStub.removeEventListener).toBeCalledWith(
        "message",
        expect.any(Function)
      );
    });

    it("cleans up the socket resource when closed without an error", () => {
      // arrange
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );

      connection.close();

      expect(socketStub.close).toBeCalledWith();
    });

    it("cleans up the socket resource when closed with an error", () => {
      // arrange
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );

      const error = new Error();
      connection.close(error);

      expect(socketStub.close).toBeCalledWith();
    });

    it("calls onClose", () => {
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      connection.onClose(onCloseCallback);
      connection.close();

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith();
    });

    it("calls onClose when closed with an error", () => {
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error();

      connection.onClose(onCloseCallback);
      connection.close(error);

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith(error);
    });

    it("subsequent calls to close result in only a single invocation of onClose", () => {
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
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

    it("the onClose callback is called with an error when the socket is closed unexpectedly", () => {
      const socket = new MockSocket() as unknown as WebSocket;
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socket,
        deserializer,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      connection.onClose(onCloseCallback);
      (socket as unknown as MockSocket).mock.close({});

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toHaveBeenCalledWith(
        new Error("WebsocketDuplexConnection: Socket closed unexpectedly.")
      );
    });

    it("the onClose callback is called with an error when the socket is closed with an error", () => {
      const socket = new MockSocket() as unknown as WebSocket;
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socket,
        deserializer,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const expectedError = new Error(
        "WebsocketDuplexConnection: Test error 1"
      );

      connection.onClose(onCloseCallback);
      (socket as unknown as MockSocket).mock.error({ error: expectedError });

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

    it("serializes and writes the given frame to the underlying socket", () => {
      // arrange
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );

      // act
      connection.send(setupFrame);

      // assert
      expect(socketStub.send).toBeCalledWith(expect.any(Buffer));
    });

    it("does not write the given frame to the underlying socket when close was previously called", () => {
      // arrange
      const socketStub = mock<WebSocket>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        deserializer,
        () => multiplexerDemultiplexer
      );

      // act
      connection.close();
      connection.send(setupFrame);

      // assert
      expect(socketStub.send).toBeCalledTimes(0);
    });
  });

  describe("when receiving data", () => {
    const setupFrame: SetupFrame = {
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
    };

    describe("when buffer contains a single frame", () => {
      it("deserializes received frames and calls the configured handler", () => {
        // arrange
        const multiplexerDemultiplexer = mock<
          Multiplexer & Demultiplexer & FrameHandler
        >();
        const socketStub = new MockSocket() as unknown as WebSocket;
        const connection = new WebsocketDuplexConnection(
          socketStub,
          new Deserializer(),
          () => multiplexerDemultiplexer
        );

        // act
        (socketStub as unknown as MockSocket).mock.message({
          data: serializeFrame(setupFrame),
        });

        // assert
        expect(multiplexerDemultiplexer.handle).toBeCalledTimes(1);

        const [call0] = multiplexerDemultiplexer.handle.mock.calls;
        const [arg0] = call0;
        expect(arg0).toMatchSnapshot();
      });
    });

    describe("causes an error", () => {
      it("the connection is closed", () => {
        // arrange
        const multiplexerDemultiplexer = mock<
          Multiplexer & Demultiplexer & FrameHandler
        >();
        const socketStub = new MockSocket() as unknown as WebSocket;
        const deserializerStub = mock<Deserializer>();
        const connection = new WebsocketDuplexConnection(
          socketStub as unknown as WebSocket,
          deserializerStub,
          () => multiplexerDemultiplexer
        );
        deserializerStub.deserializeFrame.mockImplementation(() => {
          throw new Error("Mock error");
        });
        const onCloseCallback = jest.fn();
        const data = Buffer.allocUnsafe(0).toString();

        // act
        connection.onClose(onCloseCallback);
        (socketStub as unknown as MockSocket).mock.message({ data });

        // assert
        expect(onCloseCallback).toBeCalledTimes(1);
        expect(onCloseCallback).toBeCalledWith(expect.any(Error));
      });
    });
  });
});
