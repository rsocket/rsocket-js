/**
 * Frame header is:
 * - stream id (uint32 = 4)
 * - type + flags (uint 16 = 2)
 */
export const FRAME_HEADER_SIZE: number = 6;

/**
 * Size of frame length and metadata length fields.
 */
export const UINT24_SIZE: number = 3;

export const SETUP_FIXED_SIZE: number = 14;

export const RESUME_TOKEN_LENGTH_SIZE: number = 2;
