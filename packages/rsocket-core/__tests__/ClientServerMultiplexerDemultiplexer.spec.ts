import { mock } from "jest-mock-extended";
import {
  Closeable,
  ConnectionFrameHandler,
  Flags,
  FrameHandler,
  FrameTypes,
  Outbound,
  SetupFrame,
  StreamFrameHandler,
} from "../src";
import {
  ClientServerInputMultiplexerDemultiplexer,
  StreamIdGenerator,
} from "../src/ClientServerMultiplexerDemultiplexer";

describe("ClientServerMultiplexerDemultiplexer", function () {
  describe("handle()", () => {
    it("throws if called twice", async () => {
      // arrange
      const frameHandlerStub = mock<FrameHandler>();
      const outbound = mock<Outbound & Closeable>();
      const multiplexerDemultiplexer =
        new ClientServerInputMultiplexerDemultiplexer(
          StreamIdGenerator.create(-1),
          outbound,
          outbound
        );
      // assert
      expect(
        multiplexerDemultiplexer.connectionInbound.bind(
          multiplexerDemultiplexer,
          frameHandlerStub
        )
      ).not.toThrow();
      expect(
        multiplexerDemultiplexer.connectionInbound.bind(
          multiplexerDemultiplexer,
          frameHandlerStub
        )
      ).toThrow("Connection frame handler has already been installed");
      expect(
        multiplexerDemultiplexer.handleRequestStream.bind(
          multiplexerDemultiplexer,
          frameHandlerStub
        )
      ).not.toThrow();
      expect(
        multiplexerDemultiplexer.handleRequestStream.bind(
          multiplexerDemultiplexer,
          frameHandlerStub
        )
      ).toThrow("Stream handler has already been installed");
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
        const handler = mock<ConnectionFrameHandler>();
        const outbound = mock<Outbound & Closeable>();
        const multiplexerDemultiplexer =
          new ClientServerInputMultiplexerDemultiplexer(
            StreamIdGenerator.create(-1),
            outbound,
            outbound
          );

        // act
        multiplexerDemultiplexer.connectionInbound(handler);
        multiplexerDemultiplexer.handle(setupFrame);

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
        const mockHandle = jest.fn();
        const outbound = mock<Outbound & Closeable>();
        const multiplexerDemultiplexer =
          new ClientServerInputMultiplexerDemultiplexer(
            StreamIdGenerator.create(-1),
            outbound,
            outbound
          );
        const streamHandler = mock<StreamFrameHandler>({
          streamId: 1,
          handle: mockHandle,
        });

        // act
        multiplexerDemultiplexer.add(streamHandler);
        multiplexerDemultiplexer.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT,
          data: Buffer.from("hello world"),
          metadata: undefined,
          streamId: 1,
        });
        multiplexerDemultiplexer.handle({
          type: FrameTypes.PAYLOAD,
          flags: Flags.NEXT,
          data: Buffer.from("hello world 2"),
          metadata: undefined,
          streamId: 1,
        });

        // assert
        expect(mockHandle).toBeCalledTimes(2);

        const [call0, call1] = mockHandle.mock.calls;

        expect(call0).toMatchSnapshot();
        expect(call1).toMatchSnapshot();
      });
    });
  });
});
