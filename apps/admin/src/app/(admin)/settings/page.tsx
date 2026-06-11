"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigGroup } from "./components/config-group";

const tabKeys = ["general", "auth", "smtp", "upload"] as const;

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const [activeTab, setActiveTab] = useState("general");

  const tabs = tabKeys.map((key) => ({ key, label: t(`tabs.${key}`) }));

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <div className="mb-6 flex space-x-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {tabs.find((tab) => tab.key === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConfigGroup group={activeTab} />
        </CardContent>
      </Card>
    </div>
  );
}
