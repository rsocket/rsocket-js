export class WellKnownAuthType {
  constructor(readonly string: string, readonly identifier: number) {}

  /**
   * Find the {@link WellKnownAuthType} for the given identifier (as an {@link number}). Valid
   * identifiers are defined to be integers between 0 and 127, inclusive. Identifiers outside of
   * this range will produce the {@link #UNPARSEABLE_AUTH_TYPE}. Additionally, some identifiers in
   * that range are still only reserved and don't have a type associated yet: this method returns
   * the {@link #UNKNOWN_RESERVED_AUTH_TYPE} when passing such an identifier, which lets call sites
   * potentially detect this and keep the original representation when transmitting the associated
   * metadata buffer.
   *
   * @param id the looked up identifier
   * @return the {@link WellKnownAuthType}, or {@link #UNKNOWN_RESERVED_AUTH_TYPE} if the id is out
   *     of the specification's range, or {@link #UNKNOWN_RESERVED_AUTH_TYPE} if the id is one that
   *     is merely reserved but unknown to this implementation.
   */
  static fromIdentifier(id: number): WellKnownAuthType {
    if (id < 0x00 || id > 0x7f) {
      return WellKnownAuthType.UNPARSEABLE_AUTH_TYPE;
    }
    return WellKnownAuthType.TYPES_BY_AUTH_ID[id];
  }

  /**
   * Find the {@link WellKnownAuthType} for the given {@link String} representation. If the
   * representation is {@code null} or doesn't match a {@link WellKnownAuthType}, the {@link
   * #UNPARSEABLE_AUTH_TYPE} is returned.
   *
   * @param authTypeString the looked up mime type
   * @return the matching {@link WellKnownAuthType}, or {@link #UNPARSEABLE_AUTH_TYPE} if none
   *     matches
   */
  static fromString(authTypeString: string): WellKnownAuthType {
    if (!authTypeString) {
      throw new Error("type must be non-null");
    }

    // force UNPARSEABLE if by chance UNKNOWN_RESERVED_MIME_TYPE's text has been used
    if (
      authTypeString === WellKnownAuthType.UNKNOWN_RESERVED_AUTH_TYPE.string
    ) {
      return WellKnownAuthType.UNPARSEABLE_AUTH_TYPE;
    }

    return (
      WellKnownAuthType.TYPES_BY_AUTH_STRING.get(authTypeString) ||
      WellKnownAuthType.UNPARSEABLE_AUTH_TYPE
    );
  }

  /** @see #string() */
  toString(): string {
    return this.string;
  }
}

export namespace WellKnownAuthType {
  export const UNPARSEABLE_AUTH_TYPE: WellKnownAuthType = new WellKnownAuthType(
    "UNPARSEABLE_AUTH_TYPE_DO_NOT_USE",
    -2
  );
  export const UNKNOWN_RESERVED_AUTH_TYPE: WellKnownAuthType =
    new WellKnownAuthType("UNKNOWN_YET_RESERVED_DO_NOT_USE", -1);

  export const SIMPLE: WellKnownAuthType = new WellKnownAuthType(
    "simple",
    0x00
  );
  export const BEARER: WellKnownAuthType = new WellKnownAuthType(
    "bearer",
    0x01
  );

  export const TYPES_BY_AUTH_ID: WellKnownAuthType[] = new Array(128);
  export const TYPES_BY_AUTH_STRING: Map<string, WellKnownAuthType> = new Map();

  const ALL_MIME_TYPES: WellKnownAuthType[] = [
    UNPARSEABLE_AUTH_TYPE,
    UNKNOWN_RESERVED_AUTH_TYPE,
    SIMPLE,
    BEARER,
  ];

  TYPES_BY_AUTH_ID.fill(UNKNOWN_RESERVED_AUTH_TYPE);

  for (const value of ALL_MIME_TYPES) {
    if (value.identifier >= 0) {
      TYPES_BY_AUTH_ID[value.identifier] = value;
      TYPES_BY_AUTH_STRING.set(value.string, value);
    }
  }

  if (Object.seal) {
    Object.seal(TYPES_BY_AUTH_ID);
  }
}
