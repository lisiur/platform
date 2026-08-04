export type CredentialProviderData = { password: string };

export type WechatProviderData = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  scope?: string;
};

export type WebAuthnProviderData = {
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceType: "platform" | "cross-platform";
  deviceName: string;
};

export type AccountProviderData =
  | CredentialProviderData
  | WechatProviderData
  | WebAuthnProviderData;
