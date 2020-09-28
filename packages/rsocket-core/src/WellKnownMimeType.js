'use strict';
// @flow

export default class WellKnownMimeType {
  _identifier: number;
  _string: string;

  constructor(str: string, identifier: number) {
    this._string = str;
    this._identifier = identifier;
  }

  /**
   * Find the {@link WellKnownMimeType} for the given identifier (as an {@code int}). Valid
   * identifiers are defined to be integers between 0 and 127, inclusive. Identifiers outside of
   * this range will produce the {@link #UNPARSEABLE_MIME_TYPE}. Additionally, some identifiers in
   * that range are still only reserved and don't have a type associated yet: this method returns
   * the {@link #UNKNOWN_RESERVED_MIME_TYPE} when passing such an identifier, which lets call sites
   * potentially detect this and keep the original representation when transmitting the associated
   * metadata buffer.
   *
   * @param id the looked up identifier
   * @return the {@link WellKnownMimeType}, or {@link #UNKNOWN_RESERVED_MIME_TYPE} if the id is out
   *     of the specification's range, or {@link #UNKNOWN_RESERVED_MIME_TYPE} if the id is one that
   *     is merely reserved but unknown to this implementation.
   */
  static fromIdentifier(id: number): WellKnownMimeType {
    if (id < 0x00 || id > 0x7f) {
      return UNPARSEABLE_MIME_TYPE;
    }
    return TYPES_BY_MIME_ID[id];
  }

  /**
   * Find the {@link WellKnownMimeType} for the given {@link String} representation. If the
   * representation is {@code null} or doesn't match a {@link WellKnownMimeType}, the {@link
   * #UNPARSEABLE_MIME_TYPE} is returned.
   *
   * @param mimeType the looked up mime type
   * @return the matching {@link WellKnownMimeType}, or {@link #UNPARSEABLE_MIME_TYPE} if none
   *     matches
   */
  static fromString(mimeType: string): WellKnownMimeType {
    if (!mimeType) {
      throw new Error('type must be non-null');
    }

    // force UNPARSEABLE if by chance UNKNOWN_RESERVED_MIME_TYPE's text has been used
    if (mimeType === UNKNOWN_RESERVED_MIME_TYPE.string) {
      return UNPARSEABLE_MIME_TYPE;
    }

    return TYPES_BY_MIME_STRING.get(mimeType) || UNPARSEABLE_MIME_TYPE;
  }

  /** @return the byte identifier of the mime type, guaranteed to be positive or zero. */
  get identifier(): number {
    return this._identifier;
  }

  /**
   * @return the mime type represented as a {@link String}, which is made of US_ASCII compatible
   *     characters only
   */
  get string(): string {
    return this._string;
  }

  /** @see #getString() */
  toString(): string {
    return this._string;
  }
}

export const UNPARSEABLE_MIME_TYPE: WellKnownMimeType = new WellKnownMimeType(
  'UNPARSEABLE_MIME_TYPE_DO_NOT_USE',
  -2,
);
export const UNKNOWN_RESERVED_MIME_TYPE: WellKnownMimeType = new WellKnownMimeType(
  'UNKNOWN_YET_RESERVED_DO_NOT_USE',
  -1,
);

export const APPLICATION_AVRO: WellKnownMimeType = new WellKnownMimeType(
  'application/avro',
  0x00,
);
export const APPLICATION_CBOR: WellKnownMimeType = new WellKnownMimeType(
  'application/cbor',
  0x01,
);
export const APPLICATION_GRAPHQL: WellKnownMimeType = new WellKnownMimeType(
  'application/graphql',
  0x02,
);
export const APPLICATION_GZIP: WellKnownMimeType = new WellKnownMimeType(
  'application/gzip',
  0x03,
);
export const APPLICATION_JAVASCRIPT: WellKnownMimeType = new WellKnownMimeType(
  'application/javascript',
  0x04,
);
export const APPLICATION_JSON: WellKnownMimeType = new WellKnownMimeType(
  'application/json',
  0x05,
);
export const APPLICATION_OCTET_STREAM: WellKnownMimeType = new WellKnownMimeType(
  'application/octet-stream',
  0x06,
);
export const APPLICATION_PDF: WellKnownMimeType = new WellKnownMimeType(
  'application/pdf',
  0x07,
);
export const APPLICATION_THRIFT: WellKnownMimeType = new WellKnownMimeType(
  'application/vnd.apache.thrift.binary',
  0x08,
);
export const APPLICATION_PROTOBUF: WellKnownMimeType = new WellKnownMimeType(
  'application/vnd.google.protobuf',
  0x09,
);
export const APPLICATION_XML: WellKnownMimeType = new WellKnownMimeType(
  'application/xml',
  0x0a,
);
export const APPLICATION_ZIP: WellKnownMimeType = new WellKnownMimeType(
  'application/zip',
  0x0b,
);
export const AUDIO_AAC: WellKnownMimeType = new WellKnownMimeType(
  'audio/aac',
  0x0c,
);
export const AUDIO_MP3: WellKnownMimeType = new WellKnownMimeType(
  'audio/mp3',
  0x0d,
);
export const AUDIO_MP4: WellKnownMimeType = new WellKnownMimeType(
  'audio/mp4',
  0x0e,
);
export const AUDIO_MPEG3: WellKnownMimeType = new WellKnownMimeType(
  'audio/mpeg3',
  0x0f,
);
export const AUDIO_MPEG: WellKnownMimeType = new WellKnownMimeType(
  'audio/mpeg',
  0x10,
);
export const AUDIO_OGG: WellKnownMimeType = new WellKnownMimeType(
  'audio/ogg',
  0x11,
);
export const AUDIO_OPUS: WellKnownMimeType = new WellKnownMimeType(
  'audio/opus',
  0x12,
);
export const AUDIO_VORBIS: WellKnownMimeType = new WellKnownMimeType(
  'audio/vorbis',
  0x13,
);
export const IMAGE_BMP: WellKnownMimeType = new WellKnownMimeType(
  'image/bmp',
  0x14,
);
export const IMAGE_GIG: WellKnownMimeType = new WellKnownMimeType(
  'image/gif',
  0x15,
);
export const IMAGE_HEIC_SEQUENCE: WellKnownMimeType = new WellKnownMimeType(
  'image/heic-sequence',
  0x16,
);
export const IMAGE_HEIC: WellKnownMimeType = new WellKnownMimeType(
  'image/heic',
  0x17,
);
export const IMAGE_HEIF_SEQUENCE: WellKnownMimeType = new WellKnownMimeType(
  'image/heif-sequence',
  0x18,
);
export const IMAGE_HEIF: WellKnownMimeType = new WellKnownMimeType(
  'image/heif',
  0x19,
);
export const IMAGE_JPEG: WellKnownMimeType = new WellKnownMimeType(
  'image/jpeg',
  0x1a,
);
export const IMAGE_PNG: WellKnownMimeType = new WellKnownMimeType(
  'image/png',
  0x1b,
);
export const IMAGE_TIFF: WellKnownMimeType = new WellKnownMimeType(
  'image/tiff',
  0x1c,
);
export const MULTIPART_MIXED: WellKnownMimeType = new WellKnownMimeType(
  'multipart/mixed',
  0x1d,
);
export const TEXT_CSS: WellKnownMimeType = new WellKnownMimeType(
  'text/css',
  0x1e,
);
export const TEXT_CSV: WellKnownMimeType = new WellKnownMimeType(
  'text/csv',
  0x1f,
);
export const TEXT_HTML: WellKnownMimeType = new WellKnownMimeType(
  'text/html',
  0x20,
);
export const TEXT_PLAIN: WellKnownMimeType = new WellKnownMimeType(
  'text/plain',
  0x21,
);
export const TEXT_XML: WellKnownMimeType = new WellKnownMimeType(
  'text/xml',
  0x22,
);
export const VIDEO_H264: WellKnownMimeType = new WellKnownMimeType(
  'video/H264',
  0x23,
);
export const VIDEO_H265: WellKnownMimeType = new WellKnownMimeType(
  'video/H265',
  0x24,
);
export const VIDEO_VP8: WellKnownMimeType = new WellKnownMimeType(
  'video/VP8',
  0x25,
);
export const APPLICATION_HESSIAN: WellKnownMimeType = new WellKnownMimeType(
  'application/x-hessian',
  0x26,
);
export const APPLICATION_JAVA_OBJECT: WellKnownMimeType = new WellKnownMimeType(
  'application/x-java-object',
  0x27,
);
export const APPLICATION_CLOUDEVENTS_JSON: WellKnownMimeType = new WellKnownMimeType(
  'application/cloudevents+json',
  0x28,
);

// ... reserved for future use ...
export const MESSAGE_RSOCKET_MIMETYPE: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.mime-type.v0',
  0x7a,
);
export const MESSAGE_RSOCKET_ACCEPT_MIMETYPES: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.accept-mime-types.v0',
  0x7b,
);
export const MESSAGE_RSOCKET_AUTHENTICATION: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.authentication.v0',
  0x7c,
);
export const MESSAGE_RSOCKET_TRACING_ZIPKIN: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.tracing-zipkin.v0',
  0x7d,
);
export const MESSAGE_RSOCKET_ROUTING: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.routing.v0',
  0x7e,
);
export const MESSAGE_RSOCKET_COMPOSITE_METADATA: WellKnownMimeType = new WellKnownMimeType(
  'message/x.rsocket.composite-metadata.v0',
  0x7f,
);

export const TYPES_BY_MIME_ID: WellKnownMimeType[] = new Array(128);
export const TYPES_BY_MIME_STRING: Map<string, WellKnownMimeType> = new Map();

const ALL_MIME_TYPES: WellKnownMimeType[] = [
  UNPARSEABLE_MIME_TYPE,
  UNKNOWN_RESERVED_MIME_TYPE,
  APPLICATION_AVRO,
  APPLICATION_CBOR,
  APPLICATION_GRAPHQL,
  APPLICATION_GZIP,
  APPLICATION_JAVASCRIPT,
  APPLICATION_JSON,
  APPLICATION_OCTET_STREAM,
  APPLICATION_PDF,
  APPLICATION_THRIFT,
  APPLICATION_PROTOBUF,
  APPLICATION_XML,
  APPLICATION_ZIP,
  AUDIO_AAC,
  AUDIO_MP3,
  AUDIO_MP4,
  AUDIO_MPEG3,
  AUDIO_MPEG,
  AUDIO_OGG,
  AUDIO_OPUS,
  AUDIO_VORBIS,
  IMAGE_BMP,
  IMAGE_GIG,
  IMAGE_HEIC_SEQUENCE,
  IMAGE_HEIC,
  IMAGE_HEIF_SEQUENCE,
  IMAGE_HEIF,
  IMAGE_JPEG,
  IMAGE_PNG,
  IMAGE_TIFF,
  MULTIPART_MIXED,
  TEXT_CSS,
  TEXT_CSV,
  TEXT_HTML,
  TEXT_PLAIN,
  TEXT_XML,
  VIDEO_H264,
  VIDEO_H265,
  VIDEO_VP8,
  APPLICATION_HESSIAN,
  APPLICATION_JAVA_OBJECT,
  APPLICATION_CLOUDEVENTS_JSON,
  MESSAGE_RSOCKET_MIMETYPE,
  MESSAGE_RSOCKET_ACCEPT_MIMETYPES,
  MESSAGE_RSOCKET_AUTHENTICATION,
  MESSAGE_RSOCKET_TRACING_ZIPKIN,
  MESSAGE_RSOCKET_ROUTING,
  MESSAGE_RSOCKET_COMPOSITE_METADATA,
];

TYPES_BY_MIME_ID.fill(UNKNOWN_RESERVED_MIME_TYPE);

for (const value of ALL_MIME_TYPES) {
  if (value.identifier >= 0) {
    TYPES_BY_MIME_ID[value.identifier] = value;
    TYPES_BY_MIME_STRING.set(value.string, value);
  }
}

if (Object.seal) {
  Object.seal(TYPES_BY_MIME_ID);
}
