import gql from "graphql-tag";

export const typeDefs = gql`
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
