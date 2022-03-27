export const resolvers = {
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
