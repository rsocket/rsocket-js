import { ApolloServerBase, GraphQLOptions } from "apollo-server-core";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocket,
} from "@rsocket/core";

export interface RSocketContext {
  payload: Payload;
}

export class ApolloServer<
  ContextFunctionParams = RSocketContext
> extends ApolloServerBase<ContextFunctionParams> {
  async createGraphQLServerOptions(payload: Payload): Promise<GraphQLOptions> {
    const contextParams: RSocketContext = { payload };
    return this.graphQLServerOptions(contextParams);
  }

  public getHandler(): Partial<RSocket> {
    return {
      requestResponse(
        payload: Payload,
        responderStream: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber
      ): Cancellable & OnExtensionSubscriber {
        const { data } = payload;
        console.log(data);
        return {
          cancel(): void {},
          onExtension(): void {},
        };
      },
    };
  }
}
