import {
  RSocketClient,
  BufferEncoders,
  encodeCompositeMetadata,
  TEXT_PLAIN,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
  MESSAGE_RSOCKET_ROUTING,
  MESSAGE_RSOCKET_AUTHENTICATION,
  encodeRoute,
  encodeSimpleAuthMetadata,
} from 'rsocket-core';
import type { ReactiveSocket, Payload, ISubscriber, ISubscription, DuplexConnection, Frame, ConnectionStatus } from 'rsocket-types';
import { Flowable, Signle } from 'rsocket-flowable';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import WebSocket from 'ws';


class ResubscribeOperator<T> implements ISubscriber<T>, ISubscription {
  source: Flowable<T>;
  actual: ISubscriber<T>;

  done: boolean;
  once: boolean;

  upstream: ISubscription;

  requested: number;

  constructor(source: Flowable<T>, actual: ISubscriber<T>) {
    this.source = source;
    this.actual = actual;
    this.requested = 0;
  }

  onSubscribe(subscription: ISubscription) {
    if (this.done) {
      subscription.cancel();
      return;
    }

    this.upstream = subscription;

    if (!this.once) {
      this.once = true;
      this.actual.onSubscribe(this);
      return;
    }

    subscription.request(this.requested);
  }

  onComplete() {
    if (this.done) {
      return;
    }

    this.done = true;
    this.actual.onComplete();
  }

  onError(error: Error) {
    if (this.done) {
      return;
    }

    this.upstream = null;
    setTimeout(() => this.source.subscribe(this));
  }

  onNext(value: T) {
    if (this.done) {
      return;
    }

    this.requested--;
    this.actual.onNext(value);
  }

  cancel() {
    if (this.done) {
      return;
    }

    this.done = true;

    if (this.upstream) {
      this.upstream = null;
      this.upstream.cancel();
    }
  }

  request(n: number) {
    this.requested += n;
    if (this.upstream) {
      this.upstream.request(n);
    }
  }
}

class ReconnectableRSocket<D, M> implements ReactiveSocket<D, M> {

  socket: ReactiveSocket<D, M>;
  clientFactory: () => RSocketClient<D, M>;

  constructor(clientFactory: () => RSocketClient<D, M>) {
    this.clientFactory = clientFactory;
    this.connect();
  }

  connect() {
    this.clientFactory().connect().then(
      socket => {
        this.socket = socket;
        socket.connectionStatus().subscribe(event => {
          if (event.kind !== 'CONNECTED') {
            this.socket = null;
            this.connect();
          }
        });
      },
      error => this.connect()
    );
  }

  fireAndForget(payload: Payload<D, M>): void {
    if (!this.socket) {
      throw new Error('Not Connected yet. Retry later');
    }

    this.socket.fireAndForget(payload);
  }

  requestResponse(payload: Payload<D, M>): Single<Payload<D, M>> {
    if (!this.socket) {
      return Single.error(new Error('Not Connected yet. Retry later'));
    }

    return this.socket.requestResponse(payload);
  }

  requestStream(payload: Payload<D, M>): Flowable<Payload<D, M>> {
    if (!this.socket) {
      return Flowable.error(new Error('Not Connected yet. Retry later'));
    }

    return this.socket.requestStream(payload);
  }

  requestChannel(payloads: Flowable<Payload<D, M>>): Flowable<Payload<D, M>> {
    if (!this.socket) {
      return Flowable.error(new Error('Not Connected yet. Retry later'));
    }

    return this.socket.requestChannel(payloads);
  }

  metadataPush(payload: Payload<D, M>): Single<void> {
    if (!this.socket) {
      return Single.error(new Error('Not Connected yet. Retry later'));
    }

    return this.socket.metadataPush(payload);
  }

}

const maxRSocketRequestN = 2147483647;
const keepAlive = 60000;
const lifetime = 180000;
const dataMimeType = 'application/octet-stream';
const metadataMimeType = MESSAGE_RSOCKET_COMPOSITE_METADATA.string;
const route = 'rsocket.request.stream';

const clientFactory: () => RSocketClient<Buffer, Buffer> = () => new RSocketClient({
  setup: {
    dataMimeType,
    keepAlive,
    lifetime,
    metadataMimeType,
    payload: {
      data: undefined,
      metadata: encodeCompositeMetadata([
        [TEXT_PLAIN, Buffer.from('Hello World')],
        [MESSAGE_RSOCKET_ROUTING, encodeRoute(route)],
        [
          MESSAGE_RSOCKET_AUTHENTICATION,
          encodeSimpleAuthMetadata('user', 'pass'),
        ],
        ['custom/test/metadata', Buffer.from([1, 2, 3])],
      ]),
    },
  },
  transport: new RSocketWebSocketClient(
    {
      debug: true,
      url: 'ws://localhost:8080/rsocket',
      wsCreator: url => new WebSocket(url),
    },
    BufferEncoders,
  ),
});


const socket = new ReconnectableRSocket(clientFactory);


const request = new Flowable(subscriber => {
  socket
    .requestStream({
      data: Buffer.from('request-stream'),
      metadata: encodeCompositeMetadata([
        [TEXT_PLAIN, Buffer.from('Hello World')],
        [MESSAGE_RSOCKET_ROUTING, encodeRoute(route)],
        [
          MESSAGE_RSOCKET_AUTHENTICATION,
          encodeSimpleAuthMetadata('user', 'pass'),
        ],
        ['custom/test/metadata', Buffer.from([1, 2, 3])],
      ]),
    })
    .subscribe(subscriber);
});

request
  .map()
  .lift(actual => new ResubscribeOperator(request, actual))
  .subscribe({
    // eslint-disable-next-line no-console
    onComplete: () => console.log('Request-stream completed'),
    onError: error =>
      console.error(`Request-stream error:${error.message}`),
    // eslint-disable-next-line no-console
    onNext: value => console.log('%s %s', value.data, value.metadata),
    onSubscribe: sub => sub.request(maxRSocketRequestN),
  });

setTimeout(() => { }, 30000000);
