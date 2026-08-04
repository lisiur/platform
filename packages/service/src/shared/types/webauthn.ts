export interface WebAuthnChallenge {
  userId?: string;
  challenge: string;
  expiresAt: number;
}
