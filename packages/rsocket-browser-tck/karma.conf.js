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

    browsers: ["ChromeHeadless"],

    singleRun: process.env.WATCH !== true,

    karmaTypescriptConfig: {
      bundlerOptions: {
        addNodeGlobals: false,
      },
    },
  });
};
