export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  avatar?: string | null;
  role?: string | null;
  flags: string[];
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
  activeOrganizationId?: string | null;
};

export type SessionData = {
  user: AuthUser;
  session: AuthSession;
  permissions: string[];
} | null;

export type LinkType = "GROUP" | "INTERNAL" | "EXTERNAL";

export interface MenuRecord {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url: string | null;
  sortOrder: number;
}

export interface MenuTreeNode {
  id: string;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url: string | null;
  children: MenuTreeNode[];
}

export interface OrganizationOwner {
  id: string;
  name: string;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: string;
  owner?: OrganizationOwner | null;
}

export interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  favicon?: string | null;
  copyright?: string | null;
  icp?: string | null;
  psif?: string | null;
  watermarkEnabled: boolean;
  watermarkConfig?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface CurrentApplication {
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  copyright?: string | null;
  icp?: string | null;
  psif?: string | null;
  watermarkEnabled: boolean;
  watermarkConfig?: string | null;
}
