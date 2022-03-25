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
import {
  ApolloGraphQLRSocketLink,
  ApolloServer,
} from "@rsocket/graphql-apollo-link";
import { ApolloClient, InMemoryCache } from "@apollo/client/core";
import gql from "graphql-tag";

let serverCloseable;

const typeDefs = gql`
  type Echo {
    message: String
  }

  type Query {
    echo: Echo
  }
`;

const resolvers = {
  Query: {
    echo: () => {
      return {
        message: "[PH] hello world",
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

async function requestResponse(rsocket: RSocket) {
  return new Promise((resolve, reject) => {
    return rsocket.requestResponse(
      {
        data: Buffer.from("Hello World"),
      },
      {
        onError: (e) => {
          reject(e);
        },
        onNext: (payload, isComplete) => {
          console.log(
            `payload[data: ${payload.data}; metadata: ${payload.metadata}]|${isComplete}`
          );
          resolve(payload);
        },
        onComplete: () => {},
        onExtension: () => {},
      }
    );
  });
}

async function main() {

  new ApolloServer({});

  // server setup
  // const apolloServer = new ApolloServer({
  //   typeDefs,
  //   resolvers,
  // });
  // await apolloServer.start();
  //
  // const server = makeServer({
  //   handler: apolloServer.getHandler(),
  // });
  // serverCloseable = await server.bind();
  //
  // // client setup
  // const connector = makeConnector();
  // const rsocket = await connector.connect();
  //
  // const client = new ApolloClient({
  //   cache: new InMemoryCache(),
  //   link: new ApolloGraphQLRSocketLink(rsocket),
  // });
  //
  // const result = await client.query({
  //   query: gql`
  //     query Echo {
  //       message
  //     }
  //   `,
  // });
  //
  // console.log(result);

  // await requestResponse(rsocket);
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
