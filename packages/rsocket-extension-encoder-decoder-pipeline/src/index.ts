import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
} from "@rsocket/rsocket-core";
import {
  encodeCompositeMetadata,
  encodeRoutes,
  WellKnownMimeType,
} from "@rsocket/rsocket-composite-metadata";
import MESSAGE_RSOCKET_ROUTING = WellKnownMimeType.MESSAGE_RSOCKET_ROUTING;

export function encoderDecoderPipelineExtension(rsocket: Partial<RSocket>) {
  return new EncoderDecoderPipelineExtension(rsocket);
}

enum RequestTypes {
  REQUEST_RESPONSE = 0x04, // Request Response: Request single response.
  REQUEST_FNF = 0x05, // Fire And Forget: A single one-way message.
  REQUEST_STREAM = 0x06, // Request Stream: Request a completable stream.
  REQUEST_CHANNEL = 0x07, // Request Channel: Request a completable stream in both directions.
}

function prepareDataMetaData({ data, encoder }) {
  const encodedData = encoder.dataMapper.encodeData(data);
  const metadata = [];
  if (encoder.routes && encoder.routes.length) {
    metadata.push([MESSAGE_RSOCKET_ROUTING, encodeRoutes(...encoder.routes)]);
  }
  const encodedMetadata = metadata.length
    ? encodeCompositeMetadata(metadata)
    : undefined;
  return {
    encodedData,
    encodedMetadata,
  };
}

export class EncoderDecoderPipelineExtension {
  constructor(private rsocket: Partial<RSocket>) {}

  fireAndForget(data: any, responderStream?: OnTerminalSubscriber) {
    let builder = new InteractionBuilder(
      this,
      RequestTypes.REQUEST_FNF,
      ({ encoder, responderImpl }): Cancellable => {
        const { encodedData, encodedMetadata } = prepareDataMetaData({
          data,
          encoder,
        });
        return this.rsocket.fireAndForget(
          {
            data: encodedData,
            metadata: encodedMetadata,
          },
          responderImpl
        );
      }
    );
    if (responderStream) {
      builder.responder(responderStream);
    }
    return builder;
  }

  requestResponse(
    data: any,
    responderStream?: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ) {
    let builder = new InteractionBuilder(
      this,
      RequestTypes.REQUEST_RESPONSE,
      ({ encoder, decoder, responderImpl }): Cancellable => {
        const { encodedData, encodedMetadata } = prepareDataMetaData({
          data,
          encoder,
        });
        return this.rsocket.requestResponse(
          {
            data: encodedData,
            metadata: encodedMetadata,
          },
          {
            onComplete(): void {
              responderImpl.onComplete();
            },
            onError(error: Error): void {
              responderImpl.onError();
            },
            onExtension(
              extendedType: number,
              content: Buffer | null | undefined,
              canBeIgnored: boolean
            ): void {
              responderImpl.onExtension(extendedType, content, canBeIgnored);
            },
            onNext(payload: Payload, isComplete: boolean): void {
              const decodedData = decoder.dataMapper.decodeData(payload.data);
              responderImpl.onNext(
                {
                  data: decodedData,
                  metadata: payload.metadata,
                },
                isComplete
              );
            },
          }
        );
      }
    );
    if (responderStream) {
      builder.responder(responderStream);
    }
    return builder;
  }

  requestStream() {
    throw new Error("Not Yet Implemented!");
  }

  requestChannel() {
    throw new Error("Not Yet Implemented!");
  }
}

class InteractionBuilder {
  private readonly encoderBuilder: EncoderBuilder;
  private readonly decoderBuilder: DecoderBuilder;
  private responderImpl:
    | OnTerminalSubscriber
    | OnNextSubscriber
    | OnExtensionSubscriber;

  constructor(
    private parent: EncoderDecoderPipelineExtension,
    private requestType: RequestTypes,
    private executionFn: (
      encoder
    ) => Cancellable | Requestable | OnExtensionSubscriber
  ) {
    this.encoderBuilder = new EncoderBuilder(this);
    this.decoderBuilder = new DecoderBuilder(this);
  }

  encoder() {
    return this.encoderBuilder;
  }

  decoder() {
    return this.decoderBuilder;
  }

  responder(
    responder: OnTerminalSubscriber | OnNextSubscriber | OnExtensionSubscriber
  ) {
    this.responderImpl = responder;
    return this;
  }

  exec() {
    let encoder = this.encoderBuilder.build();
    let decoder = this.decoderBuilder.build();
    return this.executionFn({
      encoder,
      decoder,
      responderImpl: this.responderImpl,
    });
  }
}

class EncoderBuilder {
  private _routes: any[] = [];
  private dataMapper: DataMapper;

  constructor(private parent: InteractionBuilder) {}

  route(route: string) {
    this._routes.push(route);
    return this;
  }

  routes(routes: string[]) {
    this._routes.push(...routes);
    return this;
  }

  mapData(dataMapper: DataMapper) {
    this.dataMapper = dataMapper;
    return this;
  }

  and() {
    return this.parent;
  }

  build() {
    return {
      routes: this._routes,
      dataMapper: this.dataMapper,
    };
  }
}

class DecoderBuilder {
  private dataMapper: DataMapper;

  constructor(private parent: InteractionBuilder) {}

  mapData(dataMapper: DataMapper) {
    this.dataMapper = dataMapper;
    return this;
  }

  and() {
    return this.parent;
  }

  build() {
    return {
      dataMapper: this.dataMapper,
    };
  }
}

export interface DataMapper {
  encodeData(data: any);
}

export class JsonDataMapper implements DataMapper {
  encodeData(data: any) {
    return Buffer.from(JSON.stringify(data));
  }

  decodeData(buffer: Buffer) {
    return JSON.parse(buffer.toString());
  }
}

export class IdentityDataMapper implements DataMapper {
  encodeData(data: any) {
    return data;
  }

  decodeData(buffer: Buffer) {
    return buffer;
  }
}
