/** Copyright (c) Facebook, Inc. and its affiliates.
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
 *
 * @flow
 */

'use strict';

export type {ClientConfig} from './RSocketClient';

export type {Entry} from './CompositeMetadata';

export type {ServerConfig, TransportServer} from './RSocketServer';

export type {Encodable} from 'rsocket-types';

export type {Encoder, Encoders} from './RSocketEncoding';

export type {Serializer, PayloadSerializers} from './RSocketSerialization';

export type {LeaseStats} from './RSocketLease';

import RSocketClient from './RSocketClient';

export {RSocketClient};

import RSocketServer from './RSocketServer';

export {RSocketServer};

import RSocketResumableTransport from './RSocketResumableTransport';

export {RSocketResumableTransport};

import WellKnownMimeType from './WellKnownMimeType';

export {WellKnownMimeType};

import WellKnownAuthType from './WellKnownAuthType';

export {WellKnownAuthType};

export {
  CONNECTION_STREAM_ID,
  ERROR_CODES,
  ERROR_EXPLANATIONS,
  FLAGS_MASK,
  FLAGS,
  FRAME_TYPE_OFFFSET,
  FRAME_TYPES,
  MAX_CODE,
  MAX_KEEPALIVE,
  MAX_LIFETIME,
  MAX_MIME_LENGTH,
  MAX_RESUME_LENGTH,
  MAX_STREAM_ID,
  MAX_VERSION,
  createErrorFromFrame,
  getErrorCodeExplanation,
  isComplete,
  isIgnore,
  isLease,
  isMetadata,
  isNext,
  isRespond,
  isResumeEnable,
  printFrame,
} from './RSocketFrame';
export {
  deserializeFrame,
  deserializeFrameWithLength,
  deserializeFrames,
  serializeFrame,
  serializeFrameWithLength,
} from './RSocketBinaryFraming';
export {
  byteLength,
  createBuffer,
  readUInt24BE,
  toBuffer,
  writeUInt24BE,
} from './RSocketBufferUtils';
export {
  BufferEncoders,
  BufferEncoder,
  Utf8Encoders,
  UTF8Encoder,
} from './RSocketEncoding';
export {
  IdentitySerializer,
  IdentitySerializers,
  JsonSerializer,
  JsonSerializers,
} from './RSocketSerialization';
export {Leases, Lease} from './RSocketLease';
export {
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
} from './WellKnownMimeType';
export {
  CompositeMetadata,
  ReservedMimeTypeEntry,
  WellKnownMimeTypeEntry,
  ExplicitMimeTimeEntry,
  encodeAndAddCustomMetadata,
  encodeAndAddWellKnownMetadata,
  encodeCompositeMetadata,
  decodeCompositeMetadata,
} from './CompositeMetadata';
export {
  RoutingMetadata,
  encodeRoute,
  encodeRoutes,
  decodeRoutes,
} from './RoutingMetadata';
export {
  encodeSimpleAuthMetadata,
  encodeBearerAuthMetadata,
  encodeWellKnownAuthMetadata,
  encodeCustomAuthMetadata,
  decodeSimpleAuthPayload,
  decodeAuthMetadata,
} from './AuthMetadata';
export {
  UNPARSEABLE_AUTH_TYPE,
  UNKNOWN_RESERVED_AUTH_TYPE,
  SIMPLE,
  BEARER,
} from './WellKnownAuthType';
