import { KeepAliveHandler } from "../src/RSocketSupport";
import { mock } from "jest-mock-extended";
import {
  Demultiplexer,
  DuplexConnection,
  Flags,
  FrameHandler,
  FrameTypes,
  Multiplexer,
} from "../src";
import { Closeable, Outbound } from "../src";

jest.useFakeTimers();

describe("KeepAliveHandler", () => {
  it("Closes the connection with an error if no KeepAlive frames received after timeout", () => {
    const keepAliveTimeoutDuration = 10000;
    const mockConnection = mock<DuplexConnection>();
    const handler = new KeepAliveHandler(
      mockConnection,
      keepAliveTimeoutDuration
    );

    handler.start();

    jest.advanceTimersByTime(keepAliveTimeoutDuration + 1000);

    expect(mockConnection.close).toBeCalledTimes(1);
  });

  it("Handling KeepAlive frame extends timeout duration", () => {
    const keepAliveTimeoutDuration = 10000;
    const mockOutbound = mock<Outbound>();
    const mockMultiplexerDemultiplexer = mock<
      Multiplexer & Demultiplexer & FrameHandler & Closeable
    >({
      connectionOutbound: mockOutbound,
    });
    const mockConnection = mock<DuplexConnection>({
      multiplexerDemultiplexer: mockMultiplexerDemultiplexer,
    });
    const handler = new KeepAliveHandler(
      mockConnection,
      keepAliveTimeoutDuration
    );

    handler.start();

    jest.advanceTimersByTime(9000);

    // handling a keep alive frame resets "last received" to "now"
    handler.handle({
      type: FrameTypes.KEEPALIVE,
      streamId: 0,
      data: undefined,
      flags: Flags.RESPOND,
      lastReceivedPosition: 0,
    });

    jest.advanceTimersByTime(9000);

    expect(mockConnection.close).toBeCalledTimes(0);
  });
});
