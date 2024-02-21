import {
  Cancellable,
  OnExtensionSubscriber,
  OnNextSubscriber,
  OnTerminalSubscriber,
  Payload,
  Requestable,
  RSocket,
} from "@rsocket/core";
import {
  ApolloServerBase,
  GraphQLOptions,
  runHttpQuery,
} from "apollo-server-core";
import { Headers, Request } from "apollo-server-env";
import { Config } from "apollo-server-core/src/types";
import { GraphQLSchema, parse, subscribe } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { isAsyncGenerator, parsePayloadForQuery } from "./utilities";
import { defer, from, Observable, of, switchMap } from "rxjs";
import { ExecutionResult } from "graphql/execution/execute";

export interface RSocketContext {
  payload: Payload;
}

export class RSocketApolloServer<
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
        const subscription = this.runQueryOperation(payload).subscribe(
          this.queryOperationSubscriber(responderStream)
        );

        return {
          cancel(): void {
            subscription.unsubscribe();
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
        const subscription = this.runSubscriptionOperation(payload).subscribe(
          this.subscriptionOperationSubscriber(responderStream)
        );

        return {
          cancel(): void {
            subscription.unsubscribe();
          },
          onExtension(): void {},
          request(requestN: number): void {},
        };
      },
    };
  }

  private queryOperationSubscriber(
    responderStream: OnTerminalSubscriber &
      OnNextSubscriber &
      OnExtensionSubscriber
  ) {
    return {
      next({ graphqlResponse }) {
        responderStream.onNext(
          {
            data: Buffer.from(graphqlResponse),
          },
          true
        );
      },
      error(e) {
        responderStream.onError(e);
      },
    };
  }

  private runQueryOperation(payload: Payload): Observable<any> {
    const query = parsePayloadForQuery(payload);

    return defer(() =>
      from(
        runHttpQuery([], {
          method: "POST",
          options: () => {
            return this.createGraphQLServerOptions(payload);
          },
          query,
          request: new Request("/graphql", {
            headers: new Headers(),
            method: "POST",
          }),
        })
      )
    );
  }

  private subscriptionOperationSubscriber(
    subscriber: OnTerminalSubscriber & OnNextSubscriber & OnExtensionSubscriber
  ) {
    return {
      next(graphqlResponse) {
        subscriber.onNext(
          {
            data: Buffer.from(JSON.stringify(graphqlResponse)),
          },
          false
        );
      },
      error() {},
      complete() {
        return subscriber.onComplete();
      },
    };
  }

  private runSubscriptionOperation(
    payload: Payload
  ): Observable<ExecutionResult> {
    const runSubscription = async () => {
      const operation = JSON.parse(payload.data.toString());
      const options = await this.createGraphQLServerOptions(payload);
      const document = parse(operation.query, options.parseOptions);
      return subscribe({
        document,
        operationName: operation.operationName,
        schema: this.schema,
        variableValues: operation.variables,
        contextValue: options.context,
      });
    };

    return defer(() => from(runSubscription())).pipe(
      switchMap((result) => {
        return isAsyncGenerator(result) ? from(result) : of(result);
      })
    );
  }
}
