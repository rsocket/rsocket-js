# Client API

`rsocket-core` provides the following types:

## RSocketClient (class)

An instance of a client. The connection is not opened automatically; call
`connect()` to initialize the connection.


### constructor (function)

```javascript
class RSocketClient {
  constructor(options: Options)
}

type Options = {
  serializers?: {
    data: Serializer
    metadata: Serializer,
  },
  setup: {
    keepAlive: number,
    lifetime: number,
    dataMimeType: string,
    metadataMimeType: string,
  },
  transport: TransportClient,
};

type Serializer<T> = {
  deserialize: (data: ?Encodable) => ?T,
  serialize: (data: ?T) => ?Encodable,
}

type Encodable = string | Buffer | UInt8Array;

type TransportClient = {
  connect: Single<DuplexConnection>,
}
```

#### serializers (property)

By default the `data` and `metadata` of each payload are passed through to the
transport layer as-is. This is appropriate for sending/receiving strings/binary.
To send/receive JSON instead, pass `serializers: JsonSerializers` (imported from
rsocket-core).

#### transport (property)

This will typically be an instance of `rsocket-tcp-client` or
`rsocket-websocket-client`, though any value conforming to the TransportClient
protocol is allowed.

### connect() (method)

Open the connection to the peer. Internally this calls `connect()` on the
transport client. See below for the `RSocket` interface.

```javascript
class RSocketClient {
  ...
  connect(): Single<RSocket>
}
```

## RSocket (interface)

Represents an instance of a rsocket peer-to-peer connection, providing the five
core interactions (fire/forget, request/reponse, etc):

### fireAndForget() (method)

Send data/metadata to the server without waiting for a response. The data is
sent immediately.

```javascript
fireAndForget(payload: Payload): void
```

### requestResponse() (method)

Send data/metadata to the server, returning a single response. The data is
sent lazily when the returned `Single` is subscribed to.

```javascript
requestResponse(payload: Payload): Single<Payload>
```

### requestStream() (method)

Send data/metadata to the server, returning a stream of responses. The semantics
of the stream are application-specific. For example, the stream may represent
updates to a single conceptual value over time, items in an incrementally loaded
list, events, etc. The data is sent to the peer lazily when the returned
`Flowable` is subscribed to and `request(n)` is called to signal demand.

```javascript
requestStream(payload: Payload): Flowable<Payload>
```

### requestChannel() (method)

Not yet implemented.

```javascript
requestChannel(payload: Flowable<Payload>): Flowable<Payload>
```

### metadataPush() (method)

Not yet implemented.

```javascript
metadataPush(payload: Payload): Single<Payload>
```

## Next

See the [flowable API](./03-flowable-api.md).
