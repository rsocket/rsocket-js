import { KeepAliveHandler } from "../src/RSocketSupport";
import { mock } from "jest-mock-extended";
import { DuplexConnection } from "../src";

jest.useFakeTimers();

describe("KeepAliveHandler", () => {
  it("Closes the connection with an error if no KeepAlive frames received after timeout", () => {
    const keepAliveTimeoutDuration = 30000;
    const mockConnection = mock<DuplexConnection>();
    const handler = new KeepAliveHandler(
      mockConnection,
      keepAliveTimeoutDuration
    );

    handler.start();

    jest.advanceTimersByTime(keepAliveTimeoutDuration + 1000);

    expect(mockConnection.close).toBeCalledTimes(1);
  });
});
