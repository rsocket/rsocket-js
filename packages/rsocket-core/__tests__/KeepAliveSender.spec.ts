import { KeepAliveSender } from "../src/RSocketSupport";
import { mock } from "jest-mock-extended";
import { Closeable, Outbound } from "../src";

jest.useFakeTimers();

describe("KeepAliveSender", () => {
  it("Sends a keep alive frame on the configured interval", () => {
    const expectedFrames = 3;
    const keepAlivePeriod = 100;
    const mockOutbound = mock<Outbound & Closeable>();
    const sender = new KeepAliveSender(mockOutbound, keepAlivePeriod);

    sender.start();

    jest.advanceTimersByTime(expectedFrames * keepAlivePeriod);

    expect(mockOutbound.send).toBeCalledTimes(expectedFrames);
  });
});
