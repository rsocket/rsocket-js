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

import { RSocket, RSocketConnector } from "rsocket-core";
import { makeRSocketLink } from "rsocket-graphql-apollo-link";
import { WebsocketClientTransport } from "rsocket-websocket-client";
import { ApolloClient, InMemoryCache } from "@apollo/client/core";
import gql from "graphql-tag";
import WebSocket from "ws";
import { exit } from "process";
import { WellKnownMimeType } from "rsocket-composite-metadata";

let rsocketClient: RSocket;

function makeRSocketConnector() {
  return new RSocketConnector({
    setup: {
      dataMimeType: WellKnownMimeType.APPLICATION_JSON.toString(),
      metadataMimeType:
        WellKnownMimeType.MESSAGE_RSOCKET_COMPOSITE_METADATA.toString(),
    },
    transport: new WebsocketClientTransport({
      url: "ws://localhost:7000/rsocket",
      wsCreator: (url) => new WebSocket(url) as any,
    }),
  });
}

function makeApolloClient({ rsocketClient }) {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: makeRSocketLink({
      rsocket: rsocketClient,
      route: "graphql",
    }),
  });
}

async function main() {
  // client setup
  const connector = makeRSocketConnector();
  rsocketClient = await connector.connect();

  const apolloClient = makeApolloClient({ rsocketClient });

  const greeting = await apolloClient.query({
    variables: {},
    query: gql`
      query greeting {
        greeting
      }
    `,
  });

  console.log(greeting);

  const echo = await apolloClient.query({
    variables: {
      input: "Hello World",
    },
    query: gql`
      query echo($input: String) {
        echo(input: $input) {
          message
        }
      }
    `,
  });

  console.log(echo);
}

main()
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  })
  .finally(async () => {
    rsocketClient.close();
  });
