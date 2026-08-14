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
import { AccountTable } from "./components/account-table";
import { AgentTable } from "./components/agent-table";
import { ConfigurationCheckButton } from "./components/configuration-check";
import { KeyTable } from "./components/key-table";
import { ModelPricingTable } from "./components/model-pricing-table";
import { ModelTable } from "./components/model-table";
import { ProviderTable } from "./components/provider-table";

const tabs = [
  "providers",
  "accounts",
  "keys",
  "models",
  "modelPricing",
  "agents",
] as const;

export default function AiSettingsPage() {
  const t = useTranslations("AiSettings");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="providers">
          <div className="mb-6 flex items-center justify-between gap-4">
            <TabsList className="w-fit">
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {t(tab)}
                </TabsTrigger>
              ))}
            </TabsList>
            <ConfigurationCheckButton />
          </div>
          <TabsContent value="providers">
            <Card>
              <CardHeader>
                <CardTitle>{t("providers")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ProviderTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>{t("accounts")}</CardTitle>
              </CardHeader>
              <CardContent>
                <AccountTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="keys">
            <Card>
              <CardHeader>
                <CardTitle>{t("keys")}</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="models">
            <Card>
              <CardHeader>
                <CardTitle>{t("models")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="modelPricing">
            <Card>
              <CardHeader>
                <CardTitle>{t("modelPricing")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelPricingTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle>{t("agents")}</CardTitle>
              </CardHeader>
              <CardContent>
                <AgentTable />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ManagementPageShell>
  );
}
