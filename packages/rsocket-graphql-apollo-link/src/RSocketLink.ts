import { split } from "@apollo/client/core";
import { getMainDefinition } from "@apollo/client/utilities";
import { QueryLink } from "./QueryLink";
import { SubscriptionLink } from "./SubscriptionLink";
import { RSocket } from "@rsocket/core";

export type makeRSocketLinkConfig = {
  rsocket: RSocket;
};

export const makeRSocketLink = ({ rsocket }: makeRSocketLinkConfig) => {
  return split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    new SubscriptionLink(rsocket),
    new QueryLink(rsocket)
  );
};
