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
import { PubSub } from "graphql-subscriptions";

const pubsub = new PubSub();

export const resolvers = {
  Query: {
    echo: (parent, args, context, info) => {
      const { message } = args;
      return {
        message,
      };
    },
  },
  Mutation: {
    createMessage: async (_, { message }, context, info) => {
      await pubsub.publish("POST_CREATED", {
        messageCreated: {
          message,
        },
      });
    },
  },
  Subscription: {
    messageCreated: {
      // subscribe must return an AsyncIterator
      // https://www.apollographql.com/docs/apollo-server/data/subscriptions/#resolving-a-subscription
      subscribe: () => pubsub.asyncIterator(["POST_CREATED"]),
    },
  },
};
