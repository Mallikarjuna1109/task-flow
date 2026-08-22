import crypto from 'crypto';

/** SHA-256 hex digest used to store/lookup refresh tokens without persisting the raw secret. */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
