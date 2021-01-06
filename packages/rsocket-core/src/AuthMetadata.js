// @flow

import {LiteBuffer as Buffer} from './LiteBuffer';
import {createBuffer, toBuffer} from './RSocketBufferUtils';
import WellKnownAuthType, {
  UNPARSEABLE_AUTH_TYPE,
  UNKNOWN_RESERVED_AUTH_TYPE,
  SIMPLE,
  BEARER,
} from './WellKnownAuthType';

const authTypeIdBytesLength = 1;
const customAuthTypeBytesLength = 1;
const usernameLengthBytesLength = 2;

const streamMetadataKnownMask = 0x80; // 1000 0000
const streamMetadataLengthMask = 0x7f; // 0111 1111

type AuthMetadata = {|
  type: {|
    identifier: number,
    string: string,
  |},
  payload: Buffer,
|};

type UsernameAndPassword = {|username: Buffer, password: Buffer|};

/**
 * Encode Auth metadata with the given {@link WellKnownAuthType} and auth payload {@link Buffer}
 *
 * @param authType well known auth type
 * @param authPayloadBuffer auth payload buffer
 * @returns encoded {@link WellKnownAuthType} and payload {@link Buffer}
 */
export function encodeWellKnownAuthMetadata(
  authType: WellKnownAuthType,
  authPayloadBuffer: Buffer,
): Buffer {
  if (
    authType === UNPARSEABLE_AUTH_TYPE ||
    authType === UNKNOWN_RESERVED_AUTH_TYPE
  ) {
    throw new Error(
      `Illegal WellKnownAuthType[${authType.toString()}]. Only allowed AuthType should be used`,
    );
  }

  const buffer = createBuffer(authTypeIdBytesLength);

  // eslint-disable-next-line no-bitwise
  buffer.writeUInt8(authType.identifier | streamMetadataKnownMask);

  return Buffer.concat([buffer, authPayloadBuffer]);
}

/**
 * Encode Auth metadata with the given custom auth type {@link string} and auth payload {@link Buffer}
 *
 * @param customAuthType custom auth type
 * @param authPayloadBuffer auth payload buffer
 * @returns encoded {@link WellKnownAuthType} and payload {@link Buffer}
 */
export function encodeCustomAuthMetadata(
  customAuthType: string,
  authPayloadBuffer: Buffer,
): Buffer {
  const customAuthTypeBuffer = toBuffer(customAuthType);

  if (customAuthTypeBuffer.byteLength !== customAuthType.length) {
    throw new Error('Custom auth type must be US_ASCII characters only');
  }
  if (
    customAuthTypeBuffer.byteLength < 1 ||
    customAuthTypeBuffer.byteLength > 128
  ) {
    throw new Error(
      'Custom auth type must have a strictly positive length that fits on 7 unsigned bits, ie 1-128',
    );
  }

  const buffer = createBuffer(
    customAuthTypeBytesLength + customAuthTypeBuffer.byteLength,
  );

  // encoded length is one less than actual length, since 0 is never a valid length, which gives
  // wider representation range
  buffer.writeUInt8(customAuthTypeBuffer.byteLength - 1);
  buffer.write(customAuthType, customAuthTypeBytesLength);

  return Buffer.concat([buffer, authPayloadBuffer]);
}

/**
 * Encode Simple Auth metadata with the given username and password
 *
 * @param username username
 * @param password password
 * @returns encoded {@link SIMPLE} and given username and password as auth payload {@link Buffer}
 */
export function encodeSimpleAuthMetadata(
  username: string | Buffer,
  password: string | Buffer,
): Buffer {
  const usernameBuffer = toBuffer(username);
  const passwordBuffer = toBuffer(password);
  const usernameLength = usernameBuffer.byteLength;

  if (usernameLength > 65535) {
    throw new Error(
      `Username should be shorter than or equal to 65535 bytes length in UTF-8 encoding but the given was ${usernameLength}`,
    );
  }

  const capacity = authTypeIdBytesLength + usernameLengthBytesLength;
  const buffer = createBuffer(capacity);

  // eslint-disable-next-line no-bitwise
  buffer.writeUInt8(SIMPLE.identifier | streamMetadataKnownMask);
  buffer.writeUInt16BE(usernameLength, 1);

  return Buffer.concat([buffer, usernameBuffer, passwordBuffer]);
}

/**
 * Encode Bearer Auth metadata with the given token
 *
 * @param token token
 * @returns encoded {@link BEARER} and given token as auth payload {@link Buffer}
 */
export function encodeBearerAuthMetadata(token: string | Buffer): Buffer {
  const tokenBuffer = toBuffer(token);
  const buffer = createBuffer(authTypeIdBytesLength);

  // eslint-disable-next-line no-bitwise
  buffer.writeUInt8(BEARER.identifier | streamMetadataKnownMask);

  return Buffer.concat([buffer, tokenBuffer]);
}

/**
 * Decode auth metadata {@link Buffer} into {@link AuthMetadata} object
 *
 * @param metadata auth metadata {@link Buffer}
 * @returns decoded {@link AuthMetadata}
 */
export function decodeAuthMetadata(metadata: Buffer): AuthMetadata {
  if (metadata.byteLength < 1) {
    throw new Error(
      'Unable to decode Auth metadata. Not enough readable bytes',
    );
  }

  const lengthOrId = metadata.readUInt8();
  // eslint-disable-next-line no-bitwise
  const normalizedId = lengthOrId & streamMetadataLengthMask;

  if (normalizedId !== lengthOrId) {
    const authType = WellKnownAuthType.fromIdentifier(normalizedId);

    return {
      payload: metadata.slice(1),
      type: {
        identifier: authType.identifier,
        string: authType.string,
      },
    };
  } else {
    // encoded length is realLength - 1 in order to avoid intersection with 0x00 authtype
    const realLength = lengthOrId + 1;
    if (metadata.byteLength < realLength + customAuthTypeBytesLength) {
      throw new Error(
        'Unable to decode custom Auth type. Malformed length or auth type string',
      );
    }

    const customAuthTypeString = metadata.toString(
      'utf8',
      customAuthTypeBytesLength,
      customAuthTypeBytesLength + realLength,
    );
    const payload = metadata.slice(realLength + customAuthTypeBytesLength);

    return {
      payload,
      type: {
        identifier: UNPARSEABLE_AUTH_TYPE.identifier,
        string: customAuthTypeString,
      },
    };
  }
}

/**
 * Read up to 129 bytes from the given metadata in order to get the custom Auth Type
 *
 * @param authPayload
 * @return sliced username and password buffers
 */
export function decodeSimpleAuthPayload(
  authPayload: Buffer,
): UsernameAndPassword {
  if (authPayload.byteLength < usernameLengthBytesLength) {
    throw new Error(
      'Unable to decode Simple Auth Payload. Not enough readable bytes',
    );
  }

  const usernameLength = authPayload.readUInt16BE();

  if (authPayload.byteLength < usernameLength + usernameLengthBytesLength) {
    throw new Error(
      'Unable to decode Simple Auth Payload. Not enough readable bytes',
    );
  }

  const username = authPayload.slice(
    usernameLengthBytesLength,
    usernameLengthBytesLength + usernameLength,
  );
  const password = authPayload.slice(
    usernameLengthBytesLength + usernameLength,
  );

  return {password, username};
}
