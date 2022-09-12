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

"use strict";

import {
  ApolloError,
  ApolloLink,
  FetchResult,
  Observable,
  Observer,
  Operation,
} from "@apollo/client/core";
import { MAX_REQUEST_COUNT, Payload, RSocket } from "rsocket-core";
import { ExecutionResult, print } from "graphql";
import {
  encodeCompositeMetadata,
  encodeRoutes,
  WellKnownMimeType,
} from "rsocket-composite-metadata";

type SubscribeOperation = {
  query: String;
  variables: Record<string, any>;
  operationName: string;
  extensions: Record<string, any>;
};

type SubscriptionLinkOptions = {
  /**
   * The route that the RSocket server is listening for GraphQL messages on.
   */
  route?: string;
};

class SubscriptionClient {
  constructor(
    public readonly client: RSocket,
    private readonly options: SubscriptionLinkOptions
  ) {}

  subscribe<Data = Record<string, unknown>, Extensions = unknown>(
    operation: SubscribeOperation,
    observer: Observer<ExecutionResult<Data, Extensions>>
  ): () => void {
    const metadata = new Map<WellKnownMimeType, Buffer>();
    metadata.set(
      WellKnownMimeType.MESSAGE_RSOCKET_MIMETYPE,
      Buffer.from(WellKnownMimeType.APPLICATION_JSON.toString())
    );
    if (this.options?.route) {
      metadata.set(
        WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
        encodeRoutes(this.options.route)
      );
    }

    const encodedMetadata = encodeCompositeMetadata(metadata);

    let requestStream = this.client.requestStream(
      {
        data: Buffer.from(JSON.stringify(operation)),
        metadata: encodedMetadata,
      },
      MAX_REQUEST_COUNT,
      {
        onComplete(): void {
          observer.complete();
        },
        onError(error: Error): void {
          observer.error(error);
        },
        onExtension(): void {},
        onNext(payload: Payload, isComplete: boolean): void {
          const { data } = payload;
          const decoded = data.toString();
          const deserialized = JSON.parse(decoded);
          observer.next(deserialized);
          if (isComplete) {
            observer.complete();
          }
        },
      }
    );

    return () => {
      requestStream.cancel();
    };
  }
}

export class RSocketSubscriptionLink extends ApolloLink {
  private client: SubscriptionClient;
  constructor(
    client: RSocket,
    private readonly options: SubscriptionLinkOptions
  ) {
    super();
    this.client = new SubscriptionClient(client, options);
  }

  public request(operation: Operation): Observable<FetchResult> | null {
    return new Observable<FetchResult>((observer) => {
      const serializedQuery = print(operation.query);
      return this.client.subscribe(
        {
          ...operation,
          query: serializedQuery,
        },
        {
          next(value: ExecutionResult) {
            observer.next(value);
          },
          complete() {
            observer.complete();
          },
          error(err: any) {
            if (err instanceof Error) {
              return observer.error(err);
            }

            return observer.error(
              new ApolloError({
                graphQLErrors: Array.isArray(err) ? err : [err],
              })
            );
          },
        }
      );
    });
  }
}
