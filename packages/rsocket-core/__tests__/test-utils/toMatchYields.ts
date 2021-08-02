// Modified from https://github.com/doniyor2109/jest-generator

const toOrdinalSuffix = (num) => {
  const int = parseInt(num),
    digits = [int % 10, int % 100],
    ordinals = ["st", "nd", "rd", "th"],
    oPattern = [1, 2, 3, 4],
    tPattern = [11, 12, 13, 14, 15, 16, 17, 18, 19];
  return oPattern.includes(digits[0]) && !tPattern.includes(digits[1])
    ? int + ordinals[digits[0] - 1]
    : int + ordinals[3];
};

export default function toMatchYields(iterator, yieldValues) {
  let yieldIndex = 0;
  let pass = true;
  let received;
  let expected;
  let iteratorValue;

  do {
    const [expectedYieldValue] = yieldValues[yieldIndex] || [];
    const [, argumentForYield] = yieldValues[yieldIndex - 1] || [];

    if (argumentForYield instanceof Error) {
      iteratorValue = iterator.throw(argumentForYield);
    } else {
      iteratorValue = iterator.next(argumentForYield);
    }

    const yieldedValue = iteratorValue.value;
    const isYieldValueSameAsExpected = this.equals(
      yieldedValue,
      expectedYieldValue
    );

    if (!isYieldValueSameAsExpected) {
      expected = expectedYieldValue;
      received = yieldedValue;
      pass = false;
      break;
    }

    yieldIndex++;
  } while (iteratorValue.done === false);

  const expectedMessage = this.utils.printExpected(expected);
  const receivedMessage = this.utils.printReceived(received);

  return {
    pass,
    actual: received,
    message: () => `${toOrdinalSuffix(
      yieldIndex + 1
    )} generator value produced did not match with expected.\n
        Produced: \n
          ${receivedMessage}\n
        Expected:\n
          ${expectedMessage}
      `,
  };
}
