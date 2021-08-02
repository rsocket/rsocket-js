declare namespace jest {
  interface Matchers<R> {
    toMatchYields(expectedYieldValues: any[]): R;
  }
}
