import {
  encodeWellKnownMetadataHeader,
  WellKnownMimeType,
} from "rsocket-composite-metadata";

describe("encodeWellKnownMetadataHeader", () => {
  it("encodes the header as per spec", () => {
    const header = encodeWellKnownMetadataHeader(
      WellKnownMimeType.APPLICATION_JSON.identifier,
      WellKnownMimeType.APPLICATION_JSON.toString().length
    );
    const actual = header.toJSON().data;
    expect(actual).toMatchSnapshot();
  });
});
