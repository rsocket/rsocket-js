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

import { RSocket, RSocketConnector, RSocketServer } from "@rsocket/core";
import { TcpClientTransport } from "@rsocket/transport-tcp-client";
import { TcpServerTransport } from "@rsocket/transport-tcp-server";
import { exit } from "process";
import { makeRSocketLink } from "@rsocket/graphql-apollo-link";
import { ApolloServer } from "@rsocket/graphql-apollo-server";
import { ApolloClient, InMemoryCache, NormalizedCacheObject } from "@apollo/client/core";
import gql from "graphql-tag";

let apolloServer: ApolloServer;
let rsocketClient: RSocket;

const typeDefs = gql`
  type Echo {
    message: String
  }

  type Query {
    echo(message: String): Echo
  }

  type Subscription {
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
  Subscription: {
    echo: {
      // subscribe must return an AsyncIterator
      // https://www.apollographql.com/docs/apollo-server/data/subscriptions/#resolving-a-subscription
      subscribe: async function* (parent, args, context, info) {
        const { message } = args;
        for await (const num of [1, 2, 3]) {
          yield {
            echo: {
              message: `${message} ${num}`,
            },
          };
        }
      },
    },
  },
};

function makeRSocketServer({ handler }) {
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

async function runQuery(client: ApolloClient<NormalizedCacheObject>) {
  const queryResult = await client.query({
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

  console.log(queryResult);
}

async function runSubscription(client: ApolloClient<NormalizedCacheObject>) {
  let observable = client.subscribe({
    variables: {
      message: "Hello World",
    },
    query: gql`
      subscription EchoSubscription($message: String) {
        echo(message: $message) {
          message
        }
      }
    `,
  });

  return new Promise((resolve, reject) => {
    observable.subscribe({
      next(x) {
        console.log(x);
      },
      error(err) {
        console.log(`Finished with error: ${err}`);
      },
      complete() {
        resolve(null);
      },
    });
  });
}

function makeApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      {
        async serverWillStart() {
          let rSocketServer = makeRSocketServer({
            handler: server.getHandler(),
          });
          let closeable = await rSocketServer.bind();
          return {
            async drainServer() {
              closeable.close();
            },
          };
        },
      },
    ],
  });
  return server;
}

function makeApolloClient({ rsocketClient }) {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: makeRSocketLink({
      rsocket: rsocketClient,
    }),
  });
}

async function main() {
  // server setup
  apolloServer = makeApolloServer();
  await apolloServer.start();

  // client setup
  const connector = makeConnector();
  rsocketClient = await connector.connect();

  const apolloClient = makeApolloClient({ rsocketClient });

  console.log("\nQuery Results:");
  await runQuery(apolloClient);

  console.log("\nSubscription Results:");
  await runSubscription(apolloClient);
}

main()
  .catch((error: Error) => {
    console.error(error);
    exit(1);
  })
  .finally(async () => {
    await apolloServer.stop();
    rsocketClient.close();
  });
