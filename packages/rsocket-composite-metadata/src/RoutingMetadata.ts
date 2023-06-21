/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export class RoutingMetadata implements Iterable<string> {
  _buffer: Buffer;

  constructor(buffer: Buffer) {
    this._buffer = buffer;
  }

  iterator(): Iterator<string> {
    return decodeRoutes(this._buffer);
  }

  [Symbol.iterator](): Iterator<string> {
    return decodeRoutes(this._buffer);
  }
}

/**
 * Encode given set of routes into {@link Buffer} following the <a href="https://github.com/rsocket/rsocket/blob/master/Extensions/Routing.md">Routing Metadata Layout</a>
 *
 * @param routes non-empty set of routes
 * @returns {Buffer} with encoded content
 */
export function encodeRoutes(...routes: string[]): Buffer {
  if (routes.length < 1) {
    throw new Error("routes should be non empty array");
  }

  return Buffer.concat(routes.map((route) => encodeRoute(route)));
}

export function encodeRoute(route: string): Buffer {
  const encodedRoute = Buffer.from(route, "utf8");

  if (encodedRoute.length > 255) {
    throw new Error(
      `route length should fit into unsigned byte length but the given one is ${encodedRoute.length}`
    );
  }

  const encodedLength = Buffer.allocUnsafe(1);

  encodedLength.writeUInt8(encodedRoute.length);

  return Buffer.concat([encodedLength, encodedRoute]);
}

export function* decodeRoutes(
  routeMetadataBuffer: Buffer
): Generator<string, void, any> {
  const length = routeMetadataBuffer.byteLength;
  let offset = 0;

  while (offset < length) {
    const routeLength = routeMetadataBuffer.readUInt8(offset++);

    if (offset + routeLength > length) {
      throw new Error(
        `Malformed RouteMetadata. Offset(${offset}) + RouteLength(${routeLength}) is greater than TotalLength`
      );
    }

    const route = routeMetadataBuffer.toString(
      "utf8",
      offset,
      offset + routeLength
    );
    offset += routeLength;
    yield route;
  }
}
