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

export function isAsyncIterable<T = unknown>(
  val: unknown
): val is AsyncIterable<T> {
  return typeof Object(val)[Symbol.asyncIterator] === "function";
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
        (async () => {
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
        })();

        return {
          cancel(): void {},
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
        (async () => {
          try {
            const { data } = payload;
            const decoded = data.toString();
            const deserialized = JSON.parse(decoded);
            const options = await this.createGraphQLServerOptions(payload);
            const document = parse(deserialized.query, options.parseOptions);
            const executionOptions = {
              document,
              operationName: deserialized.operationName,
              schema: this.schema,
              variableValues: deserialized.variables,
              contextValue: options.context,
            };
            const operationResult = await subscribe(executionOptions);
            if (isAsyncIterable(operationResult)) {
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
            }
          } catch (e) {
            responderStream.onError(e);
          }

          // console.log(operationResult);
          // if (!operationResult.errors) {
          //
          // }
        })();
        return {
          cancel(): void {},
          onExtension(): void {},
          request(requestN: number): void {},
        };
      },
    };
  }
}
