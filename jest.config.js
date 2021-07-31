const { defaults } = require("jest-config");

module.exports = {
  preset: "ts-jest",

  testEnvironment: "node",

  transform: {
    "^.+\\.ts?$": "ts-jest",
  },

  testRegex: "(/tests/.*|(\\.|/)(test|spec))\\.(js?|ts?)$",

  moduleFileExtensions: [...defaults.moduleFileExtensions, "ts"],

  coverageDirectory: "<rootDir>/coverage/",

  collectCoverage: true,

  coveragePathIgnorePatterns: ["(tests/.*.mock).(js?|ts?)$"],

  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
