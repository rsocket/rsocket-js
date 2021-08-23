import { MAX_REQUEST_COUNT, Payload, RSocket } from "@rsocket/rsocket-core";
import { ReplaySubject, Subject } from "rxjs";

export function wrapConnector(rsocket: RSocket) {
  return {
    fireAndForget(payload: Payload): Subject<any> {
      const source = new ReplaySubject();
      rsocket.fireAndForget(payload, {
        onError(error: Error) {
          source.error(error);
        },
        onComplete() {
          source.complete();
        },
      });
      return source;
    },

    requestResponse(payload: Payload): Subject<any> {
      const subject = new ReplaySubject();
      rsocket.requestResponse(payload, {
        onNext(payload: Payload, isComplete: boolean) {
          subject.next(payload);
          if (isComplete) {
            subject.complete();
          }
        },
        onError(error: Error) {
          subject.error(error);
        },
        onComplete() {
          subject.complete();
        },
        onExtension(
          extendedType: number,
          content: Buffer | null | undefined,
          canBeIgnored: boolean
        ) {
          throw new Error("not implemented");
        },
      });
      return subject;
    },

    requestStream(
      payload: Payload,
      requestN: number = MAX_REQUEST_COUNT
    ): Subject<any> {
      const subject = new Subject();
      rsocket.requestStream(payload, requestN, {
        onNext(payload: Payload, isComplete: boolean) {
          subject.next(payload);
          if (isComplete) {
            subject.complete();
          }
        },
        onError(error: Error) {
          subject.error(error);
        },
        onComplete() {
          subject.complete();
        },
        onExtension(
          extendedType: number,
          content: Buffer | null | undefined,
          canBeIgnored: boolean
        ) {
          throw new Error("not implemented");
        },
      });
      return subject;
    },
  };
}
