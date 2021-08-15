import { TcpClientTransport } from "../index";
import { TcpDuplexConnection } from "../TcpDuplexConnection";
import * as net from "net";
import sinon from "sinon";
import EventEmitter from "events";
import { mock } from "jest-mock-extended";
import { FrameHandler } from "@rsocket/rsocket-core/src";

// const frameHandlerStub = mock<FrameHandler>();

describe("TcpDuplexConnection", function () {
  describe("handle", () => {
    it("throws if called twice", async () => {
      // arrange
      const socketStub = sinon.createStubInstance(net.Socket);
      const frameHandlerStub = mock<FrameHandler>();
      const connection = new TcpDuplexConnection(socketStub);

      // assert
      expect(
        connection.handle.bind(connection, frameHandlerStub)
      ).not.toThrow();
      expect(connection.handle.bind(connection, frameHandlerStub)).toThrow(
        "Handle has already been installed"
      );
    });
  });

  it("removes listeners when closed", async () => {
    // arrange
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);

    connection.close();

    expect(socketStub.removeListener.calledWith("close")).toBe(true);
    expect(socketStub.removeListener.calledWith("error")).toBe(true);
    expect(socketStub.removeListener.calledWith("data")).toBe(true);
  });

  it("cleans up socket when closed without an error", async () => {
    // arrange
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);

    connection.close();

    expect(socketStub.destroy.calledWith(undefined)).toBe(true);
  });

  it("cleans up socket when closed with an error", async () => {
    // arrange
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);

    const error = new Error();
    connection.close(error);

    expect(socketStub.destroy.calledWith(error)).toBe(true);
  });

  it("calls onClose when close is called", async () => {
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);
    const onCloseCallback = jest.fn();

    connection.onClose(onCloseCallback);
    connection.close();

    expect(onCloseCallback).toBeCalledTimes(1);
    expect(onCloseCallback).toBeCalledWith();
  });

  it("calls onClose when close is called with an error", async () => {
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);
    const onCloseCallback = jest.fn();
    const error = new Error();

    connection.onClose(onCloseCallback);
    connection.close(error);

    expect(onCloseCallback).toBeCalledTimes(1);
    expect(onCloseCallback).toBeCalledWith(error);
  });

  it("subsequent calls to close only invokes the onClose callback once", async () => {
    const socketStub = sinon.createStubInstance(net.Socket);
    const connection = new TcpDuplexConnection(socketStub);
    const onCloseCallback = jest.fn();
    const error = new Error();
    connection.onClose(onCloseCallback);
    connection.close(error);
    connection.close(error);

    expect(onCloseCallback).toBeCalledTimes(1);
    expect(onCloseCallback).toBeCalledWith(error);
  });

  it("the onClose callback is called with an error if the socket is closed unexpectedly", async () => {
    const socket = new net.Socket();
    const connection = new TcpDuplexConnection(socket);
    const onCloseCallback = jest.fn();

    connection.onClose(onCloseCallback);
    socket.emit("close");

    expect(onCloseCallback).toBeCalledTimes(1);
    expect(onCloseCallback).toHaveBeenCalledWith(
      new Error("TcpDuplexConnection: Socket closed unexpectedly.")
    );
  });

  it("the onClose callback is called with an error if the socket is closed with an error", async () => {
    const socket = new net.Socket();
    const connection = new TcpDuplexConnection(socket);
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
