import { MAX_REQUEST_COUNT, Payload, RSocket } from "@rsocket/rsocket-core";
import { Observable, ReplaySubject, Subject } from "rxjs";

export function wrapConnector(rsocket: RSocket) {
  return {
    fireAndForget(payload: Payload): Observable<any> {
      return new Observable((subscriber) => {
        rsocket.fireAndForget(payload, {
          onError(error: Error) {
            subscriber.error(error);
          },
          onComplete() {
            subscriber.complete();
          },
        });
      });
    },

    requestResponse(payload: Payload): Observable<any> {
      return new Observable((subscriber) => {
        rsocket.requestResponse(payload, {
          onNext(payload: Payload, isComplete: boolean) {
            subscriber.next(payload);
            if (isComplete) {
              subscriber.complete();
            }
          },
          onError(error: Error) {
            subscriber.error(error);
          },
          onComplete() {
            subscriber.complete();
          },
          onExtension(
            extendedType: number,
            content: Buffer | null | undefined,
            canBeIgnored: boolean
          ) {
            throw new Error("not implemented");
          },
        });
      });
    },

    requestStream(
      payload: Payload,
      requestN: number = MAX_REQUEST_COUNT
    ): Observable<any> {
      return new Observable((subscriber) => {
        rsocket.requestStream(payload, requestN, {
          onNext(payload: Payload, isComplete: boolean) {
            subscriber.next(payload);
            if (isComplete) {
              subscriber.complete();
            }
          },
          onError(error: Error) {
            subscriber.error(error);
          },
          onComplete() {
            subscriber.complete();
          },
          onExtension(
            extendedType: number,
            content: Buffer | null | undefined,
            canBeIgnored: boolean
          ) {
            throw new Error("not implemented");
          },
        });
      });
    },
  };
}
