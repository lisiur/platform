export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Account types a RealAccount (owner-private master of a real-world
 * asset/liability) can represent — and whose BookAccount pockets may link to
 * one. Income/expense/equity are ledger-local by design.
 */
export const REAL_ACCOUNT_TYPES = ["asset", "liability"] as const;
export type RealAccountType = (typeof REAL_ACCOUNT_TYPES)[number];

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
  hasAccountFlag,
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
  hasAccountFlag,
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
  /**
   * `code` of the account this one nests under (one level deep; parents are
   * seeded before their children in the list order below).
   */
  parentCode?: string;
};

/**
 * The default pocket is flagged so clients can treat it as the implicit
 * asset side (`defaultDebit` = "Received Into" for income, `defaultCredit`
 * = "Paid From" for expenses/transfers); it is hidden from user-facing
 * account lists rather than removed, so legacy ledgers keep working.
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
    flags: [
      BUILTIN_ACCOUNT_FLAG,
      DEFAULT_DEBIT_ACCOUNT_FLAG,
      DEFAULT_CREDIT_ACCOUNT_FLAG,
    ],
  },
  {
    code: "openingBalance",
    type: "equity",
    sortOrder: 60,
    icon: "🧮",
    flags: [BUILTIN_ACCOUNT_FLAG, ADJUSTMENT_OFFSET_ACCOUNT_FLAG],
  },
  { code: "salary", type: "income", sortOrder: 70, icon: "💼" },
  { code: "bonus", type: "income", sortOrder: 80, icon: "🏆" },
  { code: "overtime", type: "income", sortOrder: 90, icon: "🌙" },
  { code: "benefits", type: "income", sortOrder: 100, icon: "🪙" },
  { code: "redPacket", type: "income", sortOrder: 110, icon: "🧧" },
  { code: "partTime", type: "income", sortOrder: 120, icon: "🧑‍💻" },
  { code: "sideBusiness", type: "income", sortOrder: 130, icon: "🚀" },
  { code: "taxRefund", type: "income", sortOrder: 140, icon: "🧾" },
  { code: "investment", type: "income", sortOrder: 150, icon: "📈" },
  { code: "windfall", type: "income", sortOrder: 160, icon: "🎉" },
  { code: "otherIncome", type: "income", sortOrder: 170, icon: "✨" },
  { code: "food", type: "expense", sortOrder: 200, icon: "🍜" },
  {
    code: "meals",
    type: "expense",
    sortOrder: 201,
    icon: "🍚",
    parentCode: "food",
  },
  {
    code: "snacks",
    type: "expense",
    sortOrder: 202,
    icon: "🍿",
    parentCode: "food",
  },
  {
    code: "fruit",
    type: "expense",
    sortOrder: 203,
    icon: "🍎",
    parentCode: "food",
  },
  {
    code: "groceries",
    type: "expense",
    sortOrder: 204,
    icon: "🥬",
    parentCode: "food",
  },
  { code: "apparel", type: "expense", sortOrder: 210, icon: "👕" },
  { code: "housing", type: "expense", sortOrder: 220, icon: "🏠" },
  { code: "transport", type: "expense", sortOrder: 230, icon: "🚌" },
  { code: "entertainment", type: "expense", sortOrder: 240, icon: "🎬" },
  { code: "medical", type: "expense", sortOrder: 250, icon: "🩺" },
  { code: "telecom", type: "expense", sortOrder: 260, icon: "📱" },
  { code: "education", type: "expense", sortOrder: 270, icon: "📚" },
  { code: "gifts", type: "expense", sortOrder: 280, icon: "🎊" },
  { code: "childcare", type: "expense", sortOrder: 290, icon: "🍼" },
  { code: "pets", type: "expense", sortOrder: 300, icon: "🐾" },
  { code: "travel", type: "expense", sortOrder: 310, icon: "✈️" },
];

export { STARTER_ACCOUNTS };

/** Locale kept for seeding user-visible strings the client cannot localize
 *  (the default ledger's name and the balance-adjustment offset account). */
export type SeedLocale = "en" | "zh";

export function normalizeSeedLocale(value: string | undefined): SeedLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * Localized labels for seeded account codes — the server-side mirror of the
 * clients' `account.name.<code>` catalog entries. Seeded accounts store
 * `name = null` (the label renders client-side from `code`), so journal
 * search can't match them by name; queries are translated through this map
 * into codes instead. User-renamed and user-created accounts carry a real
 * `name` and match directly. Must stay in sync with the client catalogs.
 */
export const ACCOUNT_CODE_LABELS: Record<string, Record<SeedLocale, string>> = {
  defaultAccount: { en: "Default Account", zh: "默认账户" },
  openingBalance: { en: "Opening Balance", zh: "期初余额" },
  salary: { en: "Salary", zh: "工资" },
  bonus: { en: "Bonus", zh: "奖金" },
  overtime: { en: "Overtime", zh: "加班" },
  benefits: { en: "Benefits", zh: "福利" },
  redPacket: { en: "Red Packet", zh: "红包" },
  partTime: { en: "Part-time Job", zh: "兼职" },
  sideBusiness: { en: "Side Business", zh: "副业" },
  taxRefund: { en: "Tax Refund", zh: "退税" },
  investment: { en: "Investment", zh: "投资" },
  windfall: { en: "Unexpected Income", zh: "意外收入" },
  otherIncome: { en: "Other", zh: "其他" },
  food: { en: "Food", zh: "餐饮" },
  meals: { en: "Meals", zh: "三餐" },
  snacks: { en: "Snacks", zh: "零食" },
  fruit: { en: "Fruit", zh: "水果" },
  groceries: { en: "Groceries", zh: "食材" },
  apparel: { en: "Apparel", zh: "服饰" },
  housing: { en: "Housing", zh: "住房" },
  transport: { en: "Transport", zh: "交通" },
  entertainment: { en: "Entertainment", zh: "娱乐" },
  medical: { en: "Medical", zh: "医疗" },
  telecom: { en: "Telecom", zh: "通讯" },
  education: { en: "Education", zh: "学习" },
  gifts: { en: "Gifts", zh: "人情" },
  childcare: { en: "Childcare", zh: "育儿" },
  pets: { en: "Pets", zh: "宠物" },
  travel: { en: "Travel", zh: "旅行" },
};

/**
 * Seeded-category codes whose en or zh label contains `query`
 * (case-insensitive) — the search translation behind ACCOUNT_CODE_LABELS.
 */
export function accountCodesMatchingLabel(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(ACCOUNT_CODE_LABELS)
    .filter(([, labels]) =>
      Object.values(labels).some((label) =>
        label.toLowerCase().includes(needle),
      ),
    )
    .map(([code]) => code);
}
