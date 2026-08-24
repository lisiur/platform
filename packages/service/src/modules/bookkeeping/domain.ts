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
  name: string;
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
 */
const EN: StarterAccount[] = [
  {
    name: "Default Account",
    type: "asset",
    sortOrder: 5,
    icon: "👛",
    flags: [DEFAULT_DEBIT_ACCOUNT_FLAG, DEFAULT_CREDIT_ACCOUNT_FLAG],
  },
  { name: "Cash", type: "asset", sortOrder: 10, icon: "💵" },
  { name: "Bank Card", type: "asset", sortOrder: 20, icon: "🏦" },
  { name: "Alipay", type: "asset", sortOrder: 30, icon: "💰" },
  { name: "WeChat Pay", type: "asset", sortOrder: 40, icon: "🟢" },
  { name: "Credit Card", type: "liability", sortOrder: 50, icon: "💳" },
  {
    name: "Opening Balance",
    type: "equity",
    sortOrder: 60,
    icon: "🧮",
    flags: [BUILTIN_ACCOUNT_FLAG, ADJUSTMENT_OFFSET_ACCOUNT_FLAG],
  },
  { name: "Salary", type: "income", sortOrder: 70, icon: "💼" },
  { name: "Other Income", type: "income", sortOrder: 80, icon: "🎁" },
  { name: "Food", type: "expense", sortOrder: 90, icon: "🍜" },
  { name: "Transport", type: "expense", sortOrder: 100, icon: "🚌" },
  { name: "Shopping", type: "expense", sortOrder: 110, icon: "🛍️" },
  { name: "Entertainment", type: "expense", sortOrder: 120, icon: "🎬" },
  { name: "Housing", type: "expense", sortOrder: 130, icon: "🏠" },
  { name: "Medical", type: "expense", sortOrder: 140, icon: "🩺" },
];

const ZH: StarterAccount[] = [
  {
    name: "默认账户",
    type: "asset",
    sortOrder: 5,
    icon: "👛",
    flags: [DEFAULT_DEBIT_ACCOUNT_FLAG, DEFAULT_CREDIT_ACCOUNT_FLAG],
  },
  { name: "现金", type: "asset", sortOrder: 10, icon: "💵" },
  { name: "银行卡", type: "asset", sortOrder: 20, icon: "🏦" },
  { name: "支付宝", type: "asset", sortOrder: 30, icon: "💰" },
  { name: "微信支付", type: "asset", sortOrder: 40, icon: "🟢" },
  { name: "信用卡", type: "liability", sortOrder: 50, icon: "💳" },
  {
    name: "期初余额",
    type: "equity",
    sortOrder: 60,
    icon: "🧮",
    flags: [BUILTIN_ACCOUNT_FLAG, ADJUSTMENT_OFFSET_ACCOUNT_FLAG],
  },
  { name: "工资收入", type: "income", sortOrder: 70, icon: "💼" },
  { name: "其他收入", type: "income", sortOrder: 80, icon: "🎁" },
  { name: "餐饮", type: "expense", sortOrder: 90, icon: "🍜" },
  { name: "交通", type: "expense", sortOrder: 100, icon: "🚌" },
  { name: "购物", type: "expense", sortOrder: 110, icon: "🛍️" },
  { name: "娱乐", type: "expense", sortOrder: 120, icon: "🎬" },
  { name: "住房", type: "expense", sortOrder: 130, icon: "🏠" },
  { name: "医疗", type: "expense", sortOrder: 140, icon: "🩺" },
];

export const STARTER_ACCOUNTS: Record<"en" | "zh", StarterAccount[]> = {
  en: EN,
  zh: ZH,
};

export type SeedLocale = keyof typeof STARTER_ACCOUNTS;

export function normalizeSeedLocale(value: string | undefined): SeedLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
