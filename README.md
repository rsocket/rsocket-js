# [rsocket-js](https://github.com/rsocket/rsocket-js)

[![Build](https://github.com/rsocket/rsocket-js/actions/workflows/build.yml/badge.svg?branch=1.0.x)](https://github.com/rsocket/rsocket-js/actions/workflows/build.yml)

A JavaScript implementation of the [RSocket](https://github.com/rsocket/rsocket)
protocol intended for use in browsers and/or Node.js. From [rsocket.io](http://rsocket.io/):

> [RSocket] is an application protocol providing
> [Reactive Streams](http://www.reactive-streams.org/) semantics over an
> asynchronous, binary boundary.
>
> It enables the following symmetric interaction models via async message
> passing over a single connection:
>
> - request/response (stream of 1)
> - request/stream (finite stream of many)
> - fire-and-forget (no response)
> - event subscription (infinite stream of many)
> - channel (bi-directional streams)

## Status

This branch contains a rewrite (with significant changes) of rsocket-js from [Flow](https://flow.org/) to [TypeScript](https://www.typescriptlang.org/). Please see [#158](https://github.com/rsocket/rsocket-js/issues/158) for additional details.

The artifacts published from this branch are considered UNSTABLE and may be subject to breaking changes while in preview.

**Please see the [master](https://github.com/rsocket/rsocket-js/tree/master) branch for sources related to `0.x.x` versions.**

## Installation

Individual packages published from this monorepo are distributed via NPM.

Packages are independently versioned.

- [rsocket-core](https://www.npmjs.com/package/rsocket-core)
- [rsocket-messaging](https://www.npmjs.com/package/rsocket-messaging)
- [rsocket-composite-metadata](https://www.npmjs.com/package/rsocket-composite-metadata)
- [rsocket-tcp-client](https://www.npmjs.com/package/rsocket-tcp-client)
- [rsocket-tcp-server](https://www.npmjs.com/package/rsocket-tcp-server)
- [rsocket-websocket-client](https://www.npmjs.com/package/rsocket-websocket-client)
- [rsocket-websocket-server](https://www.npmjs.com/package/rsocket-websocket-server)
- [rsocket-adapter-rxjs](https://www.npmjs.com/package/rsocket-adapter-rxjs)

## Contributing

TODO: add `CONTRIBUTING.md`

## Documentation & Examples

See [packages/rsocket-examples](https://github.com/rsocket/rsocket-js/tree/1.0.x-alpha/packages/rsocket-examples/src) for examples.

Guides for `0.x.x` versions can be found on https://rsocket.io/guides/rsocket-js.

## License

See LICENSE file.
