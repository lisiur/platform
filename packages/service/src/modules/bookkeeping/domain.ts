export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_STATUSES = ["active", "archived"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * Journal line amounts are stored as DECIMAL(12, 2): the max single-line
 * value is 9,999,999,999.99 (999,999,999,999 cents). Anything larger must be
 * rejected with a 400 before it reaches the database as a numeric overflow.
 */
export const MAX_LINE_AMOUNT = 9_999_999_999.99;
export const MAX_LINE_CENTS = 999_999_999_999;

import {
  ADJUSTMENT_OFFSET_ACCOUNT_FLAG,
  BUILTIN_ACCOUNT_FLAG,
  compareLedgerRole,
  DEFAULT_CREDIT_ACCOUNT_FLAG,
  DEFAULT_DEBIT_ACCOUNT_FLAG,
  isBuiltinAccount,
  LEDGER_ROLES,
  ROLE_RANK,
  roleAtLeast,
  SHARE_ROLES,
} from "@repo/shared";

export type { LedgerRole, ShareRole } from "@repo/shared";
export {
  ADJUSTMENT_OFFSET_ACCOUNT_FLAG,
  BUILTIN_ACCOUNT_FLAG,
  compareLedgerRole,
  DEFAULT_CREDIT_ACCOUNT_FLAG,
  DEFAULT_DEBIT_ACCOUNT_FLAG,
  isBuiltinAccount,
  LEDGER_ROLES,
  ROLE_RANK,
  roleAtLeast,
  SHARE_ROLES,
};

export type StarterAccount = {
  /** i18n key clients use to render the localized label. */
  code: string;
  type: AccountType;
  sortOrder: number;
  icon?: string;
  flags?: string[];
  meta?: Record<string, unknown>;
};

/**
 * The default pocket is flagged so the quick-entry dialog can prefill the
 * asset-side field: `defaultDebit` fills the debit side ("Received Into"
 * for income), `defaultCredit` fills the credit side ("Paid From" for
 * expenses, "From" for transfers).
 *
 * Seeded accounts carry no name: `code` is the permanent identity and
 * clients render its localized label. A user rename sets `name` as an
 * override above the label; the code is never cleared.
 */
const STARTER_ACCOUNTS: StarterAccount[] = [
  {
    code: "defaultAccount",
    type: "asset",
    sortOrder: 5,
    icon: "👛",
    flags: [DEFAULT_DEBIT_ACCOUNT_FLAG, DEFAULT_CREDIT_ACCOUNT_FLAG],
  },
  { code: "cash", type: "asset", sortOrder: 10, icon: "💵" },
  { code: "bankCard", type: "asset", sortOrder: 20, icon: "🏦" },
  { code: "alipay", type: "asset", sortOrder: 30, icon: "💰" },
  { code: "wechatPay", type: "asset", sortOrder: 40, icon: "🟢" },
  { code: "creditCard", type: "liability", sortOrder: 50, icon: "💳" },
  {
    code: "openingBalance",
    type: "equity",
    sortOrder: 60,
    icon: "🧮",
    flags: [BUILTIN_ACCOUNT_FLAG, ADJUSTMENT_OFFSET_ACCOUNT_FLAG],
  },
  { code: "salary", type: "income", sortOrder: 70, icon: "💼" },
  { code: "otherIncome", type: "income", sortOrder: 80, icon: "🎁" },
  { code: "food", type: "expense", sortOrder: 90, icon: "🍜" },
  { code: "transport", type: "expense", sortOrder: 100, icon: "🚌" },
  { code: "shopping", type: "expense", sortOrder: 110, icon: "🛍️" },
  { code: "entertainment", type: "expense", sortOrder: 120, icon: "🎬" },
  { code: "housing", type: "expense", sortOrder: 130, icon: "🏠" },
  { code: "medical", type: "expense", sortOrder: 140, icon: "🩺" },
];

export { STARTER_ACCOUNTS };

/** Locale kept for seeding user-visible strings the client cannot localize
 *  (the default ledger's name and the balance-adjustment offset account). */
export type SeedLocale = "en" | "zh";

export function normalizeSeedLocale(value: string | undefined): SeedLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
