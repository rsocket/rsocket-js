import {
  ApolloServerPlugin,
  BaseContext,
  GraphQLServerListener,
  GraphQLServiceContext,
} from "apollo-server-plugin-base";
import { RSocket } from "rsocket-core";
import { RSocketApolloServer } from "./RSocketApolloServer";

type RSocketApolloGraphlQLPluginOptions = {
  apolloServer?: RSocketApolloServer;
  makeRSocketServer: ({ handler }: { handler: Partial<RSocket> }) => any;
};

export class RSocketApolloGraphlQLPlugin<TContext extends BaseContext>
  implements ApolloServerPlugin<TContext>
{
  private apolloServer: RSocketApolloServer;
  constructor(private options: RSocketApolloGraphlQLPluginOptions) {}

  async serverWillStart(
    service: GraphQLServiceContext
  ): Promise<GraphQLServerListener | void> {
    if (!this.apolloServer) {
      throw new Error(
        "serverWillStart called without valid apolloServer reference. Did you forget to call setApolloServer?"
      );
    }
    const handler = this.apolloServer.getHandler();
    let rSocketServer = this.options.makeRSocketServer({ handler });
    let closeable = await rSocketServer.bind();
    return {
      async drainServer() {
        closeable.close();
      },
    };
  }

  setApolloServer(apolloServer: RSocketApolloServer) {
    this.apolloServer = apolloServer;
  }
}
