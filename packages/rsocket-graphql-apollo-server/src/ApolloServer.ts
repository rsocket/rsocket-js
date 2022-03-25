import {
  ApolloServerBase,
  GraphQLOptions,
  runHttpQuery,
} from "apollo-server-core";
import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  RSocket,
} from "@rsocket/core";
import { Headers, Request } from "apollo-server-env";

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
      requestResponse: (
        payload: Payload,
        responderStream: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber
      ): Cancellable & OnExtensionSubscriber => {
        const handle = async () => {
          try {
            const { data } = payload;
            const decoded = data.toString();
            const deserialized = JSON.parse(decoded);

            const { graphqlResponse } = await runHttpQuery([], {
              method: "POST",
              options: () => {
                return this.createGraphQLServerOptions(payload);
              },
              query: deserialized,
              request: new Request("/graphql", {
                headers: new Headers(),
                method: "POST",
              }),
            });

            responderStream.onNext(
              {
                data: Buffer.from(graphqlResponse),
              },
              true
            );
          } catch (e) {
            responderStream.onError(e);
          }
        };

        handle();

        return {
          cancel(): void {},
          onExtension(): void {},
        };
      },
    };
  }
}
