
# Webpack Browser Bundle Example

This folder provides and example of using Webpack to create a "library" which can be loaded in an HTML file or used in a
browser context without NPM or other bundling tools.

## Files

__rsocket.js__

[rsocket.js](./rsocket.js) demonstrates how to write a "library" that exposes functionality for creating an RSocket
connection using the WebSocket transport. Aditionally this "library" exposes a function for creating a buffer from a
given value.

For your own use cases you will likely need to alter the implementation to expose the functionality you need.

__webpack.config.js__

[webpack.config.js](./webpack.config.js) demonstrates how to configure webpack to create a library file which exposes the exports
from the [./rsocket.js](./rsocket.js) in the global scope of any HTML file which loads the built library file.

__index.html__

[index.html](./index.html) demonstrates how to use the global `rsocket` variable which is exposed by the `rsocket.js` library built by Webpack.

Note: `index.html` does not show how to load the built `rsocket.js` file as that will be up to you/your implementation to decide.

Note: when running the `serve` npm script webpack will automatically host the `index.html` file and inject the `rsocket.js` script into the `<head/>` block.
