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

export type { LedgerRole, ShareRole } from "@repo/shared";
export {
  compareLedgerRole,
  LEDGER_ROLES,
  ROLE_RANK,
  roleAtLeast,
  SHARE_ROLES,
} from "@repo/shared";

export type StarterAccount = {
  code: string;
  name: string;
  type: AccountType;
};

const EN: StarterAccount[] = [
  { code: "1001", name: "Cash", type: "asset" },
  { code: "1002", name: "Bank Card", type: "asset" },
  { code: "1003", name: "Alipay", type: "asset" },
  { code: "1004", name: "WeChat Pay", type: "asset" },
  { code: "2001", name: "Credit Card", type: "liability" },
  { code: "3001", name: "Opening Balance", type: "equity" },
  { code: "4001", name: "Salary", type: "income" },
  { code: "4002", name: "Other Income", type: "income" },
  { code: "5001", name: "Food", type: "expense" },
  { code: "5002", name: "Transport", type: "expense" },
  { code: "5003", name: "Shopping", type: "expense" },
  { code: "5004", name: "Entertainment", type: "expense" },
  { code: "5005", name: "Housing", type: "expense" },
  { code: "5006", name: "Medical", type: "expense" },
];

const ZH: StarterAccount[] = [
  { code: "1001", name: "现金", type: "asset" },
  { code: "1002", name: "银行卡", type: "asset" },
  { code: "1003", name: "支付宝", type: "asset" },
  { code: "1004", name: "微信支付", type: "asset" },
  { code: "2001", name: "信用卡", type: "liability" },
  { code: "3001", name: "期初余额", type: "equity" },
  { code: "4001", name: "工资收入", type: "income" },
  { code: "4002", name: "其他收入", type: "income" },
  { code: "5001", name: "餐饮", type: "expense" },
  { code: "5002", name: "交通", type: "expense" },
  { code: "5003", name: "购物", type: "expense" },
  { code: "5004", name: "娱乐", type: "expense" },
  { code: "5005", name: "住房", type: "expense" },
  { code: "5006", name: "医疗", type: "expense" },
];

export const STARTER_ACCOUNTS: Record<"en" | "zh", StarterAccount[]> = {
  en: EN,
  zh: ZH,
};

export type SeedLocale = keyof typeof STARTER_ACCOUNTS;

export function normalizeSeedLocale(value: string | undefined): SeedLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}
