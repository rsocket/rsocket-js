import { mock } from "jest-mock-extended";
import { Demultiplexer, Frame, FrameHandler, Multiplexer } from "rsocket-core";
import { WebsocketDuplexConnection } from "../WebsocketDuplexConnection";
import { Duplex } from "stream";

function makeDuplexStub() {
  const listeners = {
    close: [],
  };
  return mock<Duplex>({
    on(event, cb) {
      listeners[event]?.push(cb);
      return this;
    },
    destroy(error?: Error) {
      listeners.close.forEach((cb) => cb(error));
      return this;
    },
  });
}

describe("WebsocketDuplexConnection", function () {
  describe("when closed", () => {
    it("removes listeners from the underlying socket event emitter", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );

      // act
      connection.close();

      // assert
      expect(socketStub.removeAllListeners).toBeCalledWith();
    });

    it("cleans up the socket resource when closed without an error", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );

      // act
      connection.close();

      // assert
      expect(socketStub.end).toBeCalledWith();
    });

    it("cleans up the socket resource when closed with an error", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );

      // act
      const error = new Error();
      connection.close(error);

      // assert
      expect(socketStub.end).toBeCalledWith();
    });

    it("calls the onClose callback when one is registered", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      // act
      connection.onClose(onCloseCallback);
      connection.close();

      // assert
      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith();
    });

    it("when closed with an error it calls the onClose callback when one is registered", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error();

      // act
      connection.onClose(onCloseCallback);
      connection.close(error);

      // assert
      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith(error);
    });

    it("subsequent calls to close result in only a single invocation of onClose", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();
      const error = new Error();
      connection.onClose(onCloseCallback);

      // act
      connection.close(error);
      connection.close(error);

      // assert
      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toBeCalledWith(error);
    });

    it("the onClose callback is called with an error when the socket is destroyed unexpectedly", () => {
      // arrange

      const socketStub = makeDuplexStub();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );
      const onCloseCallback = jest.fn();

      connection.onClose(onCloseCallback);
      (socketStub as unknown as Duplex).destroy(new Error("simulated error"));

      expect(onCloseCallback).toBeCalledTimes(1);
      expect(onCloseCallback).toHaveBeenCalledWith(
        new Error("WebsocketDuplexConnection: Socket closed unexpectedly.")
      );
    });

    it("declares availability as 0", () => {
      // arrange
      const socketStub = mock<Duplex>();
      const multiplexerDemultiplexer = mock<
        Multiplexer & Demultiplexer & FrameHandler
      >();
      const frame = mock<Frame>();
      const connection = new WebsocketDuplexConnection(
        socketStub,
        frame,
        () => multiplexerDemultiplexer
      );

      // act
      connection.close();

      // assert
      expect(connection.availability).toEqual(0);
    });
  });

  // describe("send()", () => {
  //   const setupFrame = {
  //     type: FrameTypes.SETUP,
  //     dataMimeType: "application/octet-stream",
  //     metadataMimeType: "application/octet-stream",
  //     keepAlive: 60000,
  //     lifetime: 300000,
  //     metadata: Buffer.from("hello world"),
  //     data: Buffer.from("hello world"),
  //     resumeToken: null,
  //     streamId: 0,
  //     majorVersion: 1,
  //     minorVersion: 0,
  //     flags: Flags.METADATA,
  //   } as SetupFrame;
  //
  //   it("serializes and writes the given frame to the underlying socket", () => {
  //     // arrange
  //     const socketStub = mock<WebSocket>();
  //     const multiplexerDemultiplexer = mock<
  //       Multiplexer & Demultiplexer & FrameHandler
  //     >();
  //     const connection = new WebsocketDuplexConnection(
  //       socketStub,
  //       deserializer,
  //       () => multiplexerDemultiplexer
  //     );
  //
  //     // act
  //     connection.send(setupFrame);
  //
  //     // assert
  //     expect(socketStub.send).toBeCalledWith(expect.any(Buffer));
  //   });
  //
  //   it("does not write the given frame to the underlying socket when close was previously called", () => {
  //     // arrange
  //     const socketStub = mock<WebSocket>();
  //     const multiplexerDemultiplexer = mock<
  //       Multiplexer & Demultiplexer & FrameHandler
  //     >();
  //     const connection = new WebsocketDuplexConnection(
  //       socketStub,
  //       deserializer,
  //       () => multiplexerDemultiplexer
  //     );
  //
  //     // act
  //     connection.close();
  //     connection.send(setupFrame);
  //
  //     // assert
  //     expect(socketStub.send).toBeCalledTimes(0);
  //   });
  // });
  //
  // describe("when receiving data", () => {
  //   const setupFrame: SetupFrame = {
  //     type: FrameTypes.SETUP,
  //     dataMimeType: "application/octet-stream",
  //     metadataMimeType: "application/octet-stream",
  //     keepAlive: 60000,
  //     lifetime: 300000,
  //     metadata: Buffer.from("hello world"),
  //     data: Buffer.from("hello world"),
  //     resumeToken: null,
  //     streamId: 0,
  //     majorVersion: 1,
  //     minorVersion: 0,
  //     flags: Flags.METADATA,
  //   };
  //
  //   describe("when buffer contains a single frame", () => {
  //     it("deserializes received frames and calls the configured handler", () => {
  //       // arrange
  //       const multiplexerDemultiplexer = mock<
  //         Multiplexer & Demultiplexer & FrameHandler
  //       >();
  //       const socketStub = new MockSocket() as unknown as WebSocket;
  //       const connection = new WebsocketDuplexConnection(
  //         socketStub,
  //         new Deserializer(),
  //         () => multiplexerDemultiplexer
  //       );
  //
  //       // act
  //       (socketStub as unknown as MockSocket).mock.message({
  //         data: serializeFrame(setupFrame),
  //       });
  //
  //       // assert
  //       expect(multiplexerDemultiplexer.handle).toBeCalledTimes(1);
  //
  //       const [call0] = multiplexerDemultiplexer.handle.mock.calls;
  //       const [arg0] = call0;
  //       expect(arg0).toMatchSnapshot();
  //     });
  //   });
  //
  //   describe("causes an error", () => {
  //     it("the connection is closed", () => {
  //       // arrange
  //       const multiplexerDemultiplexer = mock<
  //         Multiplexer & Demultiplexer & FrameHandler
  //       >();
  //       const socketStub = new MockSocket() as unknown as WebSocket;
  //       const deserializerStub = mock<Deserializer>();
  //       const connection = new WebsocketDuplexConnection(
  //         socketStub as unknown as WebSocket,
  //         deserializerStub,
  //         () => multiplexerDemultiplexer
  //       );
  //       deserializerStub.deserializeFrame.mockImplementation(() => {
  //         throw new Error("Mock error");
  //       });
  //       const onCloseCallback = jest.fn();
  //       const data = Buffer.allocUnsafe(0).toString();
  //
  //       // act
  //       connection.onClose(onCloseCallback);
  //       (socketStub as unknown as MockSocket).mock.message({ data });
  //
  //       // assert
  //       expect(onCloseCallback).toBeCalledTimes(1);
  //       expect(onCloseCallback).toBeCalledWith(expect.any(Error));
  //     });
  //   });
  // });
});
