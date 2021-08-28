import {
  Closeable,
  DuplexConnection,
  ErrorCodes,
  Frame,
  FrameTypes,
  Outbound,
  RSocketError,
  RSocketServer,
  ServerTransport,
} from "../src";
import { mock } from "jest-mock-extended";
import {
  ClientServerInputMultiplexerDemultiplexer,
  StreamIdGenerator,
} from "../src/ClientServerMultiplexerDemultiplexer";

describe("RSocketServer", () => {
  describe("When receiving the first frame", () => {
    const unsupportedFirstFrameTypes = [
      FrameTypes.RESERVED,
      FrameTypes.LEASE,
      FrameTypes.KEEPALIVE,
      FrameTypes.REQUEST_RESPONSE,
      FrameTypes.REQUEST_FNF,
      FrameTypes.REQUEST_STREAM,
      FrameTypes.REQUEST_CHANNEL,
      FrameTypes.REQUEST_N,
      FrameTypes.CANCEL,
      FrameTypes.PAYLOAD,
      FrameTypes.ERROR,
      FrameTypes.METADATA_PUSH,
      FrameTypes.RESUME_OK,
      FrameTypes.EXT,
    ];

    for (const frameTypeKey of unsupportedFirstFrameTypes) {
      it(`${FrameTypes[frameTypeKey]} is rejected with an UNSUPPORTED_SETUP error`, async function () {
        const mockTransport = mock<ServerTransport>();
        const mockClosable = mock<Closeable>();
        const mockOutbound = mock<Outbound & Closeable>();
        const mockConnection = mock<DuplexConnection>();
        (mockConnection as any)[
          "multiplexerDemultiplexer"
        ] = new ClientServerInputMultiplexerDemultiplexer(
          StreamIdGenerator.create(-1),
          mockOutbound,
          mockOutbound
        );
        mockTransport.bind.mockImplementation(
          jest.fn(async (acceptor) => {
            // @ts-ignore
            const frame = {
              type: frameTypeKey,
            } as Frame;
            await acceptor(frame, mockConnection);
            return Promise.resolve(mockClosable);
          })
        );
        const server = new RSocketServer({
          transport: mockTransport,
          acceptor: undefined,
        });
        await server.bind();
        expect(mockConnection.close).toBeCalled();
        const call0Args = mockConnection.close.mock.calls[0];
        const error: RSocketError = <RSocketError>call0Args[0];
        expect(ErrorCodes[error.code]).toEqual(
          ErrorCodes[ErrorCodes.UNSUPPORTED_SETUP]
        );
      });
    }
  });
});
