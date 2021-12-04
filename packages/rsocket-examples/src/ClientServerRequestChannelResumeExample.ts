import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
  RSocketConnector,
  RSocketServer,
} from "@rsocket/core";
import { exit } from "process";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";

async function main() {
  const server = new RSocketServer({
    transport: new TcpServerTransport({
      listenOptions: {
        port: 8000,
      },
    }),
    acceptor: {
      accept: async (): Promise<Partial<RSocket>> => {
        return {
          requestChannel: (
            payload: Payload,
            initialRequestN: number,
            isCompleted: boolean,
            responderStream: OnTerminalSubscriber &
              OnNextSubscriber &
              OnExtensionSubscriber &
              Requestable &
              Cancellable
          ): OnTerminalSubscriber &
            OnNextSubscriber &
            OnExtensionSubscriber &
            Requestable &
            Cancellable => {
            responderStream.onNext(payload, isCompleted);
            responderStream.request(initialRequestN);

            return {
              cancel(): void {
                responderStream.cancel();
              },
              onComplete(): void {
                responderStream.onComplete();
              },
              onError(error: Error): void {
                responderStream.onError(error);
              },
              onExtension(): void {},
              onNext(payload: Payload, isComplete: boolean): void {
                setTimeout(
                  () => responderStream.onNext(payload, isComplete),
                  10
                );
              },
              request(requestN: number): void {
                setTimeout(() => responderStream.request(requestN), 1);
              },
            };
          },
        };
      },
    },
    resume: {
      sessionTimeout: 60 * 1000, // 60sec
    },
  });
  const connector = new RSocketConnector({
    setup: {
      keepAlive: 100,
      lifetime: 10000,
    },
    resume: {
      tokenGenerator: () => Buffer.from("1"),
      reconnectFunction: (a) =>
        new Promise((r) => setTimeout(r, a * 100 + 100, 100)),
    },
    transport: new TcpClientTransport({
      connectionOptions: {
        port: 8001,
      },
    }),
  });

  await server.bind();
  const rsocket = await connector.connect();

  await new Promise((resolve, reject) => {
    let sent = 1;
    let received = 0;
    let totalRequested = 0;
    let interval;
    const requester = rsocket.requestChannel(
      {
        data: Buffer.from("1"),
      },
      16,
      false,
      {
        onError: (e) => reject(e),
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );

          received++;

          if (isComplete) {
            resolve(payload);
            return;
          }

          if (received % 16 === 0) {
            setTimeout(() => requester.request(16), 100);
          }
        },
        onComplete: () => {
          resolve(null);
        },
        onExtension: () => {},
        request: (n) => {
          totalRequested += n;
          console.log(`request(${n})`);
          if (!interval) {
            interval = setInterval(() => {
              sent++;
              if (sent === totalRequested) {
                clearInterval(interval);
                interval = undefined;
              }
              requester.onNext(
                {
                  data: Buffer.from(`${sent}`),
                },
                sent === 1000
              );
            }, 100);
          }
        },
        cancel: () => {},
      }
    );
  });
}

main().then(() => exit());
