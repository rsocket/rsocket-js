import type {
  DuplexConnection,
  Frame,
  ISubscriber,
  ISubscription,
  Encodable,
  ConnectionStatus,
} from 'rsocket-types';
import {LiteBuffer as Buffer} from './LiteBuffer';
import {Flowable} from 'rsocket-flowable';
import {
  CONNECTION_STREAM_ID,
  isComplete,
  isFollows,
  FRAME_TYPES,
  FLAGS,
} from './RSocketFrame';

export class ReassemblyDuplexConnection implements DuplexConnection {
  _source: DuplexConnection;

  constructor(source: DuplexConnection) {
    this._source = source;
  }

  sendOne(frame: Frame): void {
    this._source.sendOne(frame);
  }

  send(input: Flowable<Frame>): void {
    this._source.send(input);
  }

  receive(): Flowable<Frame> {
    return this._source
      .receive()
      .lift(actual => new ReassemblySubscriber(actual));
  }

  close(): void {
    this._source.close();
  }

  connect(): void {
    this._source.connect();
  }

  connectionStatus(): Flowable<ConnectionStatus> {
    return this._source.connectionStatus();
  }
}

class ReassemblySubscriber implements ISubscriber<Frame>, ISubscription {
  _framesReassemblyMap: Map<number, Frame> = new Map();

  _actual: ISubscriber<Frame>;
  _subscription: ISubscription;

  constructor(actual: ISubscriber<Frame>) {
    this._actual = actual;
  }

  request(n: number) {
    this._subscription.request(n);
  }

  cancel() {
    this._subscription.cancel();
    this._framesReassemblyMap.clear();
  }

  onSubscribe(s: ISubscription): void {
    if (this._subscription == null) {
      this._subscription = s;
      this._actual.onSubscribe(this);
    } else {
      s.cancel();
    }
  }

  onComplete(): void {
    this._actual.onComplete();
  }

  onError(error: Error): void {
    this._actual.onError(error);
  }

  onNext(frame: Frame): void {
    const streamId = frame.streamId;
    if (streamId !== CONNECTION_STREAM_ID) {
      const hasFollowsFlag = isFollows(frame.flags);
      const hasCompleteFlag = isComplete(frame.flags);
      const isCancelOrError =
        frame.type === FRAME_TYPES.ERROR || frame.type === FRAME_TYPES.CANCEL;

      const storedFrame = this._framesReassemblyMap.get(streamId);
      if (storedFrame) {
        if (isCancelOrError) {
          this._framesReassemblyMap.delete(streamId);
        } else {
          if (storedFrame.metadata && frame.metadata) {
            storedFrame.metadata = concatContent(
              storedFrame.metadata,
              frame.metadata,
            );
          }

          if (storedFrame.data && frame.data) {
            storedFrame.data = concatContent(storedFrame.data, frame.data);
          } else if (!storedFrame.data && frame.data) {
            storedFrame.data = frame.data;
          }

          if (!hasFollowsFlag || hasCompleteFlag) {
            if (hasCompleteFlag) {
              storedFrame.flags |= FLAGS.COMPLETE;
            }

            this._framesReassemblyMap.delete(streamId);
            this._actual.onNext(storedFrame);
          }

          return;
        }
      } else if (hasFollowsFlag && !hasCompleteFlag && !isCancelOrError) {
        this._framesReassemblyMap.set(streamId, frame);

        return;
      }
    }

    this._actual.onNext(frame);
  }
}

const concatContent = (a: Encodable, b: Encodable): Encodable => {
  switch (a.constructor.name) {
    case 'String':
      return a + b;
    case 'Uint8Array':
      const result = new Uint8Array(a.length + b.length);
      result.set(a);
      result.set(b, a.length);
      return result;
    default:
      return Buffer.concat([a, b]);
  }
};
