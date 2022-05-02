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
  ApolloLink,
  FetchResult,
  Observable,
  Operation,
} from "@apollo/client/core";
import { Payload, RSocket } from "rsocket-core";
import {
  encodeCompositeMetadata,
  encodeRoutes,
  WellKnownMimeType,
} from "rsocket-composite-metadata";
import { print } from "graphql";

const APPLICATION_GRAPHQL_JSON = "application/graphql+json";

type QueryLinkOptions = {
  /**
   * The route that the RSocket server is listening for GraphQL messages on.
   */
  route?: string;
};

export class QueryLink extends ApolloLink {
  constructor(
    public readonly client: RSocket,
    public readonly options: QueryLinkOptions
  ) {
    super();
  }

  public request(operation: Operation): Observable<FetchResult> | null {
    const json = JSON.stringify({
      ...operation,
      // per spec query should be a string (https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md#example-1)
      query: print(operation.query),
    });
    const encodedData = Buffer.from(json);

    const metadata = new Map<WellKnownMimeType, Buffer>();
    metadata.set(
      WellKnownMimeType.MESSAGE_RSOCKET_MIMETYPE,
      Buffer.from(APPLICATION_GRAPHQL_JSON)
    );
    if (this.options?.route) {
      metadata.set(
        WellKnownMimeType.MESSAGE_RSOCKET_ROUTING,
        encodeRoutes(this.options.route)
      );
    }

    const encodedMetadata = encodeCompositeMetadata(metadata);

    return new Observable<FetchResult>((observer) => {
      this.client.requestResponse(
        {
          data: encodedData,
          metadata: encodedMetadata,
        },
        {
          onComplete(): void {},
          onError(error: Error): void {
            observer.error(error);
          },
          onExtension(): void {},
          onNext(payload: Payload, isComplete: boolean): void {
            const { data } = payload;
            const decoded = data.toString();
            const deserialized = JSON.parse(decoded);
            observer.next(deserialized);
            observer.complete();
          },
        }
      );
    });
  }
}
