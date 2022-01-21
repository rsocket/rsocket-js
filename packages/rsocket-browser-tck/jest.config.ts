import type { Config } from "@jest/types";
import { pathsToModuleNameMapper } from "ts-jest/utils";
import { compilerOptions } from "../../tsconfig.json";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testRegex: "(\\/__tests__\\/.*|\\.(test|spec))\\.(ts)$",
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    // This has to match the baseUrl defined in tsconfig.json.
    prefix: "<rootDir>/../../",
  }),
  modulePathIgnorePatterns: ["__tests__/*.d.ts"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!**/node_modules/**"],
};

export default config;
