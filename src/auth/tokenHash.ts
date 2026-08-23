import crypto from 'crypto';

// The raw refresh token is never persisted, only its hash.
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
