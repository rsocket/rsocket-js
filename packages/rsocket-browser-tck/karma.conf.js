process.env.CHROME_BIN = require("puppeteer").executablePath();

module.exports = function (config) {
  config.set({
    frameworks: ["mocha", "karma-typescript"],

    files: [
      { pattern: "node_modules/expect.js/index.js" },
      { pattern: "src/**/*.ts" },
    ],

    preprocessors: {
      "**/*.ts": ["karma-typescript"],
    },

    reporters: ["mocha", "karma-typescript"],

    browsers: ["ChromeHeadlessCI"],

    singleRun: process.env.WATCH !== true,

    customLaunchers: {
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox"],
      },
    },

    karmaTypescriptConfig: {
      bundlerOptions: {
        addNodeGlobals: false,
      },
    },
  });
};
