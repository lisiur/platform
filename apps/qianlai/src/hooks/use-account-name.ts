import { useTranslations } from "next-intl";

/** Anything that carries an account's i18n code and override name. */
export type AccountLike = { code: string | null; name: string | null };

/**
 * Resolves an account's display name: a user-set `name` overrides the
 * label; otherwise the stable i18n `code` is rendered from Accounts.names
 * (seeded accounts); user-created accounts always carry their own name.
 */
export function useAccountName() {
  const t = useTranslations("Accounts.names");
  return (account: AccountLike) =>
    account.name ??
    (account.code && t.has(account.code) ? t(account.code) : "");
}
