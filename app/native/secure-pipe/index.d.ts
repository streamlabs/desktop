/**
 * Create a named pipe with an owner-only DACL and first-instance protection.
 *
 * The pipe grants full access only to the current user's SID and SYSTEM.
 * FILE_FLAG_FIRST_PIPE_INSTANCE prevents pipe-squatting.
 *
 * @param pipeName - The pipe name without the `\\.\pipe\` prefix (e.g. "slobs")
 * @returns A file descriptor suitable for `net.Server.listen({ fd })`
 * @throws On non-Windows platforms or if pipe creation fails
 */
export function createSecurePipe(pipeName: string): number;
