"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Checkbox,
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
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  forwardRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";

type LinkType = "GROUP" | "INTERNAL" | "EXTERNAL";

interface Permission {
  id: string;
  code: string;
  name: string;
  group: string;
}

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
}

export const MenuForm = forwardRef<MenuFormRef, MenuFormProps>(
  function MenuForm({ defaultValues, appId }, ref) {
    const t = useTranslations("Menus");
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
      new Set(),
    );

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

    useEffect(() => {
      if (!appId) return;
      let cancelled = false;
      (async () => {
        try {
          const res = await appClient.api.permissions.$get({
            query: { appId },
          });
          if (!cancelled) {
            setPermissions((await res.json()).permissions);
          }
        } catch {
          // silently ignore
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [appId]);

    const grouped = useMemo(() => {
      const map = new Map<string, Permission[]>();
      for (const permission of permissions) {
        const list = map.get(permission.group) ?? [];
        list.push(permission);
        map.set(permission.group, list);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [permissions]);

    const currentPermissionIds = watch("permissionIds");

    const togglePerm = (id: string, checked: boolean) => {
      const next = checked
        ? [...currentPermissionIds, id]
        : currentPermissionIds.filter((x) => x !== id);
      setValue("permissionIds", next, { shouldDirty: true });
    };

    const toggleGroup = (ids: string[], checked: boolean) => {
      const idSet = new Set(ids);
      const next = checked
        ? [...new Set([...currentPermissionIds, ...ids])]
        : currentPermissionIds.filter((x) => !idSet.has(x));
      setValue("permissionIds", next, { shouldDirty: true });
    };

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

        {appId && grouped.length > 0 && (
          <Field orientation="vertical">
            <FieldLabel>{t("requiredPermissions")}</FieldLabel>
            <FieldDescription>
              {t("requiredPermissionsDescription")}
            </FieldDescription>
            <div className="space-y-1 rounded-md border p-2">
              {grouped.map(([group, items]) => {
                const checkedCount = items.filter((i) =>
                  currentPermissionIds.includes(i.id),
                ).length;
                const allChecked = checkedCount === items.length;
                const someChecked = checkedCount > 0 && !allChecked;
                const isCollapsed = collapsedGroups.has(group);
                return (
                  <div key={group}>
                    <div className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                      <Checkbox
                        checked={allChecked}
                        indeterminate={someChecked}
                        onCheckedChange={(checked) =>
                          toggleGroup(
                            items.map((i) => i.id),
                            !!checked,
                          )
                        }
                      />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-sm text-inherit"
                        onClick={() =>
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(group)) {
                              next.delete(group);
                            } else {
                              next.add(group);
                            }
                            return next;
                          })
                        }
                      >
                        <span className="truncate font-medium">{group}</span>
                        <span className="text-xs text-muted-foreground">
                          ({checkedCount}/{items.length})
                        </span>
                        <ChevronRight
                          className={`ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                        />
                      </button>
                    </div>
                    {!isCollapsed &&
                      items.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 pl-8 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <Checkbox
                            checked={currentPermissionIds.includes(item.id)}
                            onCheckedChange={(checked) =>
                              togglePerm(item.id, !!checked)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>
                          <code className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {item.code}
                          </code>
                        </label>
                      ))}
                  </div>
                );
              })}
            </div>
          </Field>
        )}
      </div>
    );
  },
);
