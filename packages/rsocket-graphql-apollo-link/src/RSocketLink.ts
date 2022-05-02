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

import { split } from "@apollo/client/core";
import { getMainDefinition } from "@apollo/client/utilities";
import { QueryLink } from "./QueryLink";
import { SubscriptionLink } from "./SubscriptionLink";
import { RSocket } from "@rsocket/core";

export type makeRSocketLinkConfig = {
  rsocket: RSocket;
  route?: string;
};

export const makeRSocketLink = ({
  rsocket,
  route,
}: makeRSocketLinkConfig) => {
  return split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    new SubscriptionLink(rsocket, { route }),
    new QueryLink(rsocket, { route })
  );
};
