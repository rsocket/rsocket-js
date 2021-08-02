import Mitm from "mitm";
import { TcpClientTransport } from "../TcpClientTransport";
import { TcpDuplexConnection } from "../TcpDuplexConnection";

// jest.mock("net").useFakeTimers();

describe("TcpClientTransport", function () {
  let mitm;

  beforeEach(() => {
    mitm = Mitm();
  });

  afterEach(function () {
    mitm?.disable();
  });

  describe("connect", () => {
    it("resolves to an instance of DuplexConnection on successful connection", async () => {
      // act
      const transport = new TcpClientTransport({
        connectionOptions: {
          host: "localhost",
          port: 9090,
        },
      });
      const connection = await transport.connect();

      // assert
      expect(connection).toBeInstanceOf(TcpDuplexConnection);
    });

    it("rejects if the connection errors", async () => {
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

      mitm.on("connect", function (socket) {
        throw connectionRefusedError;
      });

      // act
      const transport = new TcpClientTransport({
        connectionOptions: {
          host: "localhost",
          port: 9090,
        },
      });

      // assert
      await expect(transport.connect()).rejects.toEqual(connectionRefusedError);
    });
  });
});
