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

import { RSocketConnector, RSocketServer } from "@rsocket/core";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";
import { exit } from "process";
import { ApolloGraphQLRSocketLink } from "@rsocket/graphql-apollo-link";
import { ApolloServer } from "@rsocket/graphql-apollo-server";
import { ApolloClient, InMemoryCache } from "@apollo/client/core";
import gql from "graphql-tag";

let serverCloseable;

const typeDefs = gql`
  type Echo {
    message: String
  }

  type Query {
    echo(message: String): Echo
  }
`;

const resolvers = {
  Query: {
    echo: (parent, args, context, info) => {
      const { message } = args;
      return {
        message,
      };
    },
  },
};

function makeServer({ handler }) {
  return new RSocketServer({
    transport: new TcpServerTransport({
      listenOptions: {
        port: 9090,
        host: "127.0.0.1",
      },
    }),
    acceptor: {
      accept: async () => handler,
    },
  });
}

function makeConnector() {
  return new RSocketConnector({
    transport: new TcpClientTransport({
      connectionOptions: {
        host: "127.0.0.1",
        port: 9090,
      },
    }),
  });
}

async function main() {
  // server setup
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ payload }) => ({
      test: 1,
    }),
  });
  await apolloServer.start();

  const server = makeServer({
    handler: apolloServer.getHandler(),
  });
  serverCloseable = await server.bind();
  serverCloseable.onClose(() => {
    apolloServer.stop();
  });

  // client setup
  const connector = makeConnector();
  const rsocket = await connector.connect();

  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloGraphQLRSocketLink(rsocket),
  });

  const result = await client.query({
    variables: {
      message: "Hello World",
    },
    query: gql`
      query MyEchoQuery($message: String) {
        echo(message: $message) {
          message
        }
      }
    `,
  });

  console.log(result);
}

main()
  .then(() => exit())
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  })
  .finally(() => {
    serverCloseable.close();
  });
