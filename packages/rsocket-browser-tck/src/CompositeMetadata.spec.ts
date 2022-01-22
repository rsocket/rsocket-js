import {
  decodeCompositeMetadata,
  decodeRoutes,
  encodeCompositeMetadata,
  encodeRoute,
  WellKnownMimeType,
} from "@rsocket/composite-metadata";

const Buffer = require("buffer/").Buffer;

// window.Buffer = Buffer;

describe("CompositeMetadata", () => {
  it("encodeRoute", () => {
    const encodedRoute = encodeRoute("test-route");
    expect(encodedRoute).to.be.an(Buffer);
  });

  it("encodeCompositeMetadata", () => {
    const map = new Map();
    const encodedMetadata = encodeCompositeMetadata(map);
    expect(encodedMetadata).to.be.an(Buffer);
  });
});
