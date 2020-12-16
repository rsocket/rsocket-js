'use strict';

import {encodeRoutes, encodeRoute, decodeRoutes} from '../RoutingMetadata';

describe('Routing Metadata', () => {
  it('should encode route properly', () => {
    const routesMetadataBuffer = encodeRoutes('E', '∑', 'é', 'W');

    expect(
      routesMetadataBuffer.equals(
        Buffer.from([1, 69, 3, -30, -120, -111, 2, -61, -87, 1, 87])
      )
    ).toBe(true);
  });

  it('should encode empty route properly', () => {
    const routesMetadataBuffer = encodeRoutes('');

    expect(routesMetadataBuffer.equals(Buffer.from([0]))).toBe(true);
  });

  it('should throw exception if route longer than 256 symbols', () => {
    expect(() => {
      let route = '∑';
      for (let i = 0; i < 254; i++) {
        route += 'W';
      }

      encodeRoute(route);
    }).toThrow(
      'route length should fit into unsigned byte length but the given one is 257'
    );
  });

  it('should throw exception if routes array is empty', () => {
    expect(() => {
      encodeRoutes();
    }).toThrow('routes should be non empty array');
  });

  it('should decode route properly', () => {
    const routesMetadataBuffer = decodeRoutes(
      Buffer.from([1, 69, 3, -30, -120, -111, 2, -61, -87, 1, 87])
    );

    expect(routesMetadataBuffer.next()).toEqual({done: false, value: 'E'});
    expect(routesMetadataBuffer.next()).toEqual({done: false, value: '∑'});
    expect(routesMetadataBuffer.next()).toEqual({done: false, value: 'é'});
    expect(routesMetadataBuffer.next()).toEqual({done: false, value: 'W'});
    expect(routesMetadataBuffer.next()).toEqual({done: true});
  });

  it('should decode empty route properly', () => {
    const routesMetadataBuffer = decodeRoutes(Buffer.from([0]));

    expect(routesMetadataBuffer.next()).toEqual({done: false, value: ''});
    expect(routesMetadataBuffer.next()).toEqual({done: true});
  });

  it('should fail on decoding malformed buffer', () => {
    const routesMetadataBuffer = decodeRoutes(Buffer.from([220, 1]));
    expect(() => routesMetadataBuffer.next()).toThrow(
      'Malformed RouteMetadata. Offset(1) + RouteLength(220) is greater than TotalLength'
    );
  });
});
