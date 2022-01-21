module.exports = function (config) {
  config.set({
    plugins: ["karma-webpack", "karma-jasmine", "karma-chrome-launcher"],

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: "",

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ["jasmine"],

    // list of files / patterns to load in the browser
    // Here I'm including all of the the Jest tests which are all under the __tests__ directory.
    // You may need to tweak this patter to find your test files/
    files: ["./karma-setup.js", "__tests__/**/*.ts"],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      "./karma-setup.js": ["webpack"],
      // Use webpack to bundle our tests files
      "__tests__/**/*.ts": ["webpack"],
    },

    browsers: ["ChromeHeadless"],

    singleRun: true,

    webpack: {
      watch: false,
      module: {
        rules: [
          {
            test: /\.ts?$/,
            use: "ts-loader",
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        alias: {
          fs: false,
          process: false,
        },
        extensions: [".ts", ".js"],
        fallback: {
          // fs: false,
          buffer: require.resolve("buffer/"),
          util: require.resolve("util/"),
          assert: require.resolve("assert/"),
          stream: require.resolve("stream-browserify/"),
          constants: require.resolve("constants-browserify/"),
          path: require.resolve("path-browserify/"),
        },
      },
    },
  });
};
