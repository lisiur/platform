"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { appClient } from "@/lib/api";

const menuSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  icon: z.string().optional().or(z.literal("")),
  url: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0),
  isExternal: z.boolean(),
  isVisible: z.boolean(),
});

type MenuInput = z.infer<typeof menuSchema>;

interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  url?: string | null;
  sortOrder: number;
  isExternal: boolean;
  isVisible: boolean;
}

interface MenuFormProps {
  menu: Menu;
  onSaved: () => void;
}

export function MenuForm({ menu, onSaved }: MenuFormProps) {
  const t = useTranslations("Menus");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<MenuInput>({
    resolver: zodResolver(menuSchema),
    defaultValues: {
      name: menu.name,
      code: menu.code,
      icon: menu.icon ?? "",
      url: menu.url ?? "",
      sortOrder: menu.sortOrder,
      isExternal: menu.isExternal,
      isVisible: menu.isVisible,
    },
  });

  useEffect(() => {
    reset({
      name: menu.name,
      code: menu.code,
      icon: menu.icon ?? "",
      url: menu.url ?? "",
      sortOrder: menu.sortOrder,
      isExternal: menu.isExternal,
      isVisible: menu.isVisible,
    });
  }, [menu, reset]);

  const isExternal = watch("isExternal");
  const isVisible = watch("isVisible");
  const iconValue = watch("icon");

  async function onSubmit(data: MenuInput) {
    try {
      await appClient.api.menu[":id"].$put({
        param: { id: menu.id },
        json: {
          name: data.name,
          code: data.code,
          icon: data.icon || null,
          url: data.url || null,
          sortOrder: data.sortOrder,
          isExternal: data.isExternal,
          isVisible: data.isVisible,
        },
      });
      toast.success(t("saveSuccess"));
      onSaved();
    } catch {
      // Error handled by client
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{t("editMenu")}</h3>
        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <Field orientation="vertical">
            <FieldLabel htmlFor="menu-name">{t("name")} *</FieldLabel>
            <FieldContent>
              <Input id="menu-name" {...register("name")} />
              <FieldError errors={errors.name ? [errors.name] : undefined} />
            </FieldContent>
          </Field>

          <Field orientation="vertical">
            <FieldLabel htmlFor="menu-code">{t("code")} *</FieldLabel>
            <FieldContent>
              <Input id="menu-code" {...register("code")} />
              <FieldError errors={errors.code ? [errors.code] : undefined} />
            </FieldContent>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field orientation="vertical">
            <FieldLabel>{t("icon")}</FieldLabel>
            <FieldContent>
              <IconPicker
                value={iconValue || undefined}
                onChange={(val) => setValue("icon", val || "")}
              />
              <FieldDescription>{t("iconDescription")}</FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="vertical">
            <FieldLabel htmlFor="menu-url">{t("url")}</FieldLabel>
            <FieldContent>
              <Input
                id="menu-url"
                {...register("url")}
                placeholder={t("urlPlaceholder")}
              />
            </FieldContent>
          </Field>
        </div>

        <Field orientation="vertical">
          <FieldLabel htmlFor="menu-sort">{t("sortOrder")}</FieldLabel>
          <FieldContent>
            <Input
              id="menu-sort"
              type="number"
              min={0}
              {...register("sortOrder", { valueAsNumber: true })}
              className="w-32"
            />
          </FieldContent>
        </Field>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isExternal}
              onCheckedChange={(checked) => setValue("isExternal", !!checked)}
            />
            {t("isExternal")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isVisible}
              onCheckedChange={(checked) => setValue("isVisible", !!checked)}
            />
            {t("isVisible")}
          </label>
        </div>
      </div>

      <Separator />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("save")}
      </Button>
    </form>
  );
}
