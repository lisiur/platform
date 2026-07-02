"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { FetchPageParams, PermissionItem } from "@repo/frontend";
import { PermissionSelector } from "@repo/frontend";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconPicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { forwardRef, type Ref, useCallback, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";

type LinkType = "GROUP" | "INTERNAL" | "EXTERNAL";

const menuSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    code: z.string().min(1, "Code is required"),
    icon: z.string().optional().or(z.literal("")),
    linkType: z.enum(["GROUP", "INTERNAL", "EXTERNAL"]),
    url: z.string().optional().or(z.literal("")),
    permissionIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (data.linkType !== "GROUP" && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL is required",
        path: ["url"],
      });
    }
  });

export type MenuInput = z.infer<typeof menuSchema>;

export interface MenuFormRef {
  validate: () => Promise<MenuInput>;
}

interface MenuFormProps {
  ref: Ref<MenuFormRef>;
  defaultValues: MenuInput;
  appId?: string;
  selectedItems?: PermissionItem[];
}

export const MenuForm = forwardRef<MenuFormRef, MenuFormProps>(
  function MenuForm({ defaultValues, appId, selectedItems = [] }, ref) {
    const t = useTranslations("Menus");

    const form = useForm<MenuInput>({
      resolver: zodResolver(menuSchema),
      defaultValues: {
        ...defaultValues,
        icon:
          defaultValues.icon ||
          (defaultValues.linkType === "GROUP" ? "Folder" : "Link"),
      },
    });

    const {
      register,
      formState: { errors },
      watch,
      setValue,
    } = form;

    const fetchPage = useCallback(
      async (params: FetchPageParams) => {
        const res = await appClient.api.permissions.$get({
          query: {
            appId: appId ?? "",
            search: params.search || undefined,
            sort: params.sort ?? undefined,
            sortDir: params.sortDir,
            limit: params.limit,
            offset: params.offset,
          },
        });
        const data = await res.json();
        return { permissions: data.permissions, total: data.total };
      },
      [appId],
    );

    const currentPermissionIds = watch("permissionIds");

    useImperativeHandle(ref, () => ({
      validate: () =>
        new Promise<MenuInput>((resolve, reject) => {
          form.handleSubmit(resolve, reject)();
        }),
    }));

    const linkType = watch("linkType");
    const iconValue = watch("icon");

    return (
      <div className="space-y-4">
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

        {linkType !== "GROUP" && (
          <Field orientation="vertical">
            <FieldLabel>{t("linkType")}</FieldLabel>
            <FieldContent>
              <Select
                value={linkType}
                onValueChange={(val) => setValue("linkType", val as LinkType)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {linkType === "INTERNAL"
                      ? t("linkTypeInternal")
                      : linkType === "EXTERNAL"
                        ? t("linkTypeExternal")
                        : ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERNAL">
                    {t("linkTypeInternal")}
                  </SelectItem>
                  <SelectItem value="EXTERNAL">
                    {t("linkTypeExternal")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        )}

        {linkType !== "GROUP" && (
          <Field orientation="vertical">
            <FieldLabel htmlFor="menu-url">{t("url")} *</FieldLabel>
            <FieldContent>
              <Input
                id="menu-url"
                {...register("url")}
                placeholder={
                  linkType === "EXTERNAL" ? "https://example.com" : "/path"
                }
              />
              <FieldError errors={errors.url ? [errors.url] : undefined} />
            </FieldContent>
          </Field>
        )}

        {appId && (
          <Field orientation="vertical">
            <FieldLabel>{t("requiredPermissions")}</FieldLabel>
            <FieldDescription>
              {t("requiredPermissionsDescription")}
            </FieldDescription>
            <PermissionSelector
              fetchPage={fetchPage}
              value={currentPermissionIds}
              selectedItems={selectedItems}
              onChange={(ids) =>
                setValue("permissionIds", ids, { shouldDirty: true })
              }
              height={300}
            />
          </Field>
        )}
      </div>
    );
  },
);
