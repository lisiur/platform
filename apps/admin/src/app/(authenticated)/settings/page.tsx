"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ConfigGroup } from "./components/config-group";

const tabKeys = ["auth", "upload", "rate-limit"] as const;

export default function SettingsPage() {
  const t = useTranslations("Settings");

  const tabs = tabKeys.map((key) => ({ key, label: t(`tabs.${key}`) }));

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="auth">
          <TabsList className="mb-6 w-fit">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              <Card>
                <CardHeader>
                  <CardTitle>{tab.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConfigGroup group={tab.key} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ManagementPageShell>
  );
}
