# rsocket-js

`rsocket-js` implements the 1.0 version of the [RSocket protocol](https://github.com/rsocket/rsocket)
and is designed for use in Node.js and browsers. From [rsocket.io](http://rsocket.io/):

> RSocket is an application protocol providing Reactive Streams semantics
> over an asynchronous, binary boundary.

## Status

The following are currently implementedЖ

- RSocketClient / RSocketServer
- Node.js TCP/WebSocket server/client transport
- Browser WebSocket client (binary)
- TCK client for spec compliance testing
- UTF-8 and Binary encoding at the transport layer
- Optional JSON (de)serialization at the rsocket layer (send and receive objects
  instead of strings)
- ReactiveStream data types

## Reactive Streams

rsocket-js includes an implementation of the [Reactive Streams](http://www.reactive-streams.org/)
API in JavaScript. Note that unlike standard Rx Observables, Reactive Streams are
*lazy*, *pull-based*, and support *back-pressure*. Two types are implemented:

- `Flowable`: An implementation of the Reactive Streams `Publisher` type,
  providing a demand-driven stream of values over time.
- `Single`: Like `Flowable`, but resolves to a single value.

rsocket-js public API methods typically return values of these types.

## Next

Next, read about the [client configuration](./01-client-configuration.md).

