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
  Requestable,
  RSocket,
} from "@rsocket/core";
import { Headers, Request } from "apollo-server-env";
import { Config } from "apollo-server-core/src/types";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLSchema, parse, subscribe } from "graphql";

export interface RSocketContext {
  payload: Payload;
}

export function isObject(val: unknown): val is Record<PropertyKey, unknown> {
  return typeof val === "object" && val !== null;
}

function isAsyncGenerator<T = unknown>(val: unknown): val is AsyncGenerator<T> {
  return (
    isObject(val) &&
    typeof Object(val)[Symbol.asyncIterator] === "function" &&
    typeof val.return === "function"
  );
}

export class ApolloServer<
  ContextFunctionParams = RSocketContext
> extends ApolloServerBase<ContextFunctionParams> {
  private readonly schema: GraphQLSchema;
  constructor(config: Config<ContextFunctionParams>) {
    super(config);
    this.schema = makeExecutableSchema({
      typeDefs: config.typeDefs,
      resolvers: config.resolvers,
    });
  }

  async createGraphQLServerOptions(payload: Payload): Promise<GraphQLOptions> {
    const contextParams: RSocketContext = { payload };
    return this.graphQLServerOptions(contextParams);
  }

  public getHandler(): Partial<RSocket> {
    return {
      // handle single Query/Mutation
      requestResponse: (
        payload: Payload,
        responderStream: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber
      ): Cancellable & OnExtensionSubscriber => {
        let cancelled = false;

        (async () => {
          try {
            const graphqlResponse = await this.runQueryOperation(payload);

            if (cancelled) {
              return;
            }

            responderStream.onNext(
              {
                data: Buffer.from(graphqlResponse),
              },
              true
            );
          } catch (e) {
            responderStream.onError(e);
          }
        })();

        return {
          cancel(): void {
            cancelled = true;
          },
          onExtension(): void {},
        };
      },

      // handle Subscriptions
      requestStream: (
        payload: Payload,
        initialRequestN: number,
        responderStream: OnTerminalSubscriber &
          OnNextSubscriber &
          OnExtensionSubscriber
      ): Requestable & Cancellable & OnExtensionSubscriber => {
        let operationResult;
        (async () => {
          try {
            operationResult = await this.runSubscribeOperation(payload);
            if (isAsyncGenerator(operationResult)) {
              for await (const result of operationResult) {
                const serialized = JSON.stringify(result);
                const encoded = Buffer.from(serialized);
                responderStream.onNext(
                  {
                    data: encoded,
                  },
                  false
                );
              }
              responderStream.onComplete();
            } else {
              if (operationResult.errors) {
                /*
                 * TODO: What is needed for proper error handling?
                 *   Sending Error frame may not be correct as error frame only
                 *   includes message, not data, and thus `operationResult.errors`
                 *   will be lost.
                 */
                // responderStream.onError(
                //   new ApolloError({
                //     graphQLErrors: operationResult.errors,
                //   })
                // );
                responderStream.onError(
                  new Error("Unhandled operation result errors.")
                );
              }
            }
          } catch (e) {
            responderStream.onError(e);
          }
        })();

        return {
          cancel(): void {
            if (operationResult && isAsyncGenerator(operationResult)) {
              operationResult.return(undefined);
            }
          },
          onExtension(): void {},
          request(requestN: number): void {},
        };
      },
    };
  }

  private async runQueryOperation(payload: Payload) {
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
    return graphqlResponse;
  }

  private async runSubscribeOperation(payload: Payload) {
    const { data } = payload;
    const decoded = data.toString();
    const deserialized = JSON.parse(decoded);
    const options = await this.createGraphQLServerOptions(payload);
    const document = parse(deserialized.query, options.parseOptions);
    return await subscribe({
      document,
      operationName: deserialized.operationName,
      schema: this.schema,
      variableValues: deserialized.variables,
      contextValue: options.context,
    });
  }
}
