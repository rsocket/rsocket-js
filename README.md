# [rsocket-js](https://github.com/rsocket/rsocket-js)

[![Build Status](https://travis-ci.org/rsocket/rsocket-js.svg?branch=master)](https://travis-ci.org/rsocket/rsocket-js)

A JavaScript implementation of the [RSocket](https://github.com/rsocket/rsocket)
protocol intended for use in browsers and/or Node.js. From [reactivesocket.io](http://reactivesocket.io/):

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

## Install

Packages are published to npm:
* [rsocket-core](https://www.npmjs.com/package/rsocket-core)
* [rsocket-flowable](https://www.npmjs.com/package/rsocket-flowable)
* [rsocket-tcp-client](https://www.npmjs.com/package/rsocket-tcp-client)
* [rsocket-tcp-server](https://www.npmjs.com/package/rsocket-tcp-server)
* [rsocket-websocket-server](https://www.npmjs.com/package/rsocket-websocket-server)
* [rsocket-websocket-client](https://www.npmjs.com/package/rsocket-websocket-client)


## Contributing

See the `CONTRIBUTING.md` file for how to help out.

## Documentation

Work in progress, see the [docs](./docs/00-index.md).

Also see the [example](https://github.com/rsocket/rsocket-js/tree/master/packages/rsocket-examples).

## License
rsocket-js is Apache-licensed. We also provide an additional patent grant.
