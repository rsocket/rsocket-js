const base = require("../../jest.config");
const packageJSON = require("./package.json");

module.exports = {
  ...base,
  displayName: packageJSON.name,
  name: packageJSON.name,
};
