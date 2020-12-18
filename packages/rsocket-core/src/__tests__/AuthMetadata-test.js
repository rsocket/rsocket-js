'use strict';

import {
  decodeAuthMetadata,
  decodeSimpleAuthPayload,
  encodeCustomAuthMetadata,
  encodeSimpleAuthMetadata,
  encodeWellKnownAuthMetadata,
} from '../AuthMetadata';
import {
  SIMPLE,
  UNKNOWN_RESERVED_AUTH_TYPE,
  UNPARSEABLE_AUTH_TYPE,
} from '../WellKnownAuthType';

describe('Auth Metadata', () => {
  it('should encode Custom Auth Metadata', () => {
    const customAuthType = 'custom/auth/type';
    const customAuthMetadata = encodeCustomAuthMetadata(
      customAuthType,
      Buffer.from([220, 1])
    );

    expect(customAuthMetadata).toEqual(
      Buffer.concat([
        Buffer.from([customAuthType.length - 1]),
        Buffer.from(customAuthType),
        Buffer.from([220, 1]),
      ])
    );
  });

  it('should error encoding too long Custom Auth Metadata', () => {
    let customAuthType = '';

    for (let i = 0; i < 129; i++) {
      customAuthType += '1';
    }

    expect(() =>
      encodeCustomAuthMetadata(customAuthType, Buffer.from([220, 1]))
    ).toThrow(
      'Custom auth type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128'
    );
  });

  it('should error encoding on empty Custom Auth Metadata', () => {
    const customAuthType = '';

    expect(() =>
      encodeCustomAuthMetadata(customAuthType, Buffer.from([220, 1]))
    ).toThrow(
      'Custom auth type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128'
    );
  });

  it('should error encoding on non ASCII Custom Auth Metadata', () => {
    const customAuthType = 'asdasd🃓𝑓';

    expect(() =>
      encodeCustomAuthMetadata(customAuthType, Buffer.from([220, 1]))
    ).toThrow('Custom auth type must be US_ASCII characters only');
  });

  it('should encode WellKnown Auth Metadata', () => {
    const wellKnownAuthMetadata = encodeWellKnownAuthMetadata(
      SIMPLE,
      Buffer.from([1, 1, 1, 1])
    );

    expect(wellKnownAuthMetadata).toEqual(
      Buffer.concat([
        // eslint-disable-next-line no-bitwise
        Buffer.from([SIMPLE.identifier | 0x80]),
        Buffer.from([1, 1, 1, 1]),
      ])
    );
  });

  it('should error on UNKNOWN or UNPARSEABLE WellKnownAuthType', () => {
    expect(() =>
      encodeWellKnownAuthMetadata(
        UNKNOWN_RESERVED_AUTH_TYPE,
        Buffer.from([1, 1, 1, 1])
      )
    ).toThrow(
      `Illegal WellKnownAuthType[${UNKNOWN_RESERVED_AUTH_TYPE}]. Only allowed AuthType should be used`
    );

    expect(() =>
      encodeWellKnownAuthMetadata(
        UNPARSEABLE_AUTH_TYPE,
        Buffer.from([1, 1, 1, 1])
      )
    ).toThrow(
      `Illegal WellKnownAuthType[${UNPARSEABLE_AUTH_TYPE}]. Only allowed AuthType should be used`
    );
  });

  it('should decode AuthMetadata with WellKnownAuthType.SIMPLE in it', () => {
    const authMetadata = decodeAuthMetadata(
      Buffer.concat([
        // eslint-disable-next-line no-bitwise
        Buffer.from([SIMPLE.identifier | 0x80]),
        Buffer.from([1, 1, 1, 1]),
      ])
    );

    expect(authMetadata).toEqual({
      payload: Buffer.from([1, 1, 1, 1]),
      type: {
        identifier: 0x00,
        string: 'simple',
      },
    });
  });

  it('should decode AuthMetadata with Custom Auth Type in it', () => {
    const customAuthType = 'custom/auth/type';
    const authMetadata = decodeAuthMetadata(
      Buffer.concat([
        Buffer.from([customAuthType.length - 1]),
        Buffer.from(customAuthType),
        Buffer.from([220, 1]),
      ])
    );

    expect(authMetadata).toEqual({
      payload: Buffer.from([220, 1]),
      type: {
        identifier: UNPARSEABLE_AUTH_TYPE.identifier,
        string: customAuthType,
      },
    });
  });

  it('Should Encode and Decode Simple Auth Metadata', () => {
    const encodedSimpleAuthMetadata = encodeSimpleAuthMetadata('user', 'pass');
    const decodedAuthMetadata = decodeAuthMetadata(encodedSimpleAuthMetadata);

    expect(decodedAuthMetadata.type).toEqual({
      identifier: SIMPLE.identifier,
      string: SIMPLE.string,
    });

    expect(decodeSimpleAuthPayload(decodedAuthMetadata.payload)).toEqual({
      password: Buffer.from('pass'),
      username: Buffer.from('user'),
    });
  });
});
