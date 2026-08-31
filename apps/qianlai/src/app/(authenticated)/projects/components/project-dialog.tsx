"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { QianlaiProject } from "@/hooks/use-projects";
import { appClient, withApiFeedback } from "@/lib/api";

const projectFormSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      new Date(data.startDate) <= new Date(data.endDate),
    { message: "dateRange", path: ["endDate"] },
  );

type ProjectFormData = z.infer<typeof projectFormSchema>;

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  project?: QianlaiProject;
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function ProjectDialog({
  open,
  onOpenChange,
  ledgerId,
  project,
}: ProjectDialogProps) {
  const t = useTranslations("Projects");
  const queryClient = useQueryClient();
  const isEdit = !!project;

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      startDate: toDateInput(project?.startDate ?? null),
      endDate: toDateInput(project?.endDate ?? null),
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const json = {
        name: data.name,
        description: data.description || null,
        startDate: data.startDate
          ? new Date(`${data.startDate}T00:00:00`).toISOString()
          : null,
        endDate: data.endDate
          ? new Date(`${data.endDate}T23:59:59.999`).toISOString()
          : null,
      };
      if (isEdit) {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
            .$patch,
        )({ param: { ledgerId, projectId: project.id }, json });
      } else {
        await withApiFeedback(
          appClient.api.bookkeeping.ledgers[":ledgerId"].projects.$post,
        )({ param: { ledgerId }, json });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["qianlai", "projects", ledgerId],
      });
      toast.success(isEdit ? t("updateSuccess") : t("createSuccess"));
      onOpenChange(false);
      form.reset();
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("create")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="project-dialog-form"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="project-name" required>
                  {t("name")}
                </FieldLabel>
                <Input
                  id="project-name"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                  placeholder={t("namePlaceholder")}
                />
                <FieldError
                  errors={
                    form.formState.errors.name
                      ? [form.formState.errors.name]
                      : undefined
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-description">
                  {t("descriptionLabel")}
                </FieldLabel>
                <Textarea
                  id="project-description"
                  {...form.register("description")}
                  placeholder={t("descriptionPlaceholder")}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.endDate}>
                  <FieldLabel htmlFor="project-start-date">
                    {t("startDate")}
                  </FieldLabel>
                  <Input
                    id="project-start-date"
                    type="date"
                    {...form.register("startDate")}
                  />
                </Field>
                <Field data-invalid={!!form.formState.errors.endDate}>
                  <FieldLabel htmlFor="project-end-date">
                    {t("endDate")}
                  </FieldLabel>
                  <Input
                    id="project-end-date"
                    type="date"
                    aria-invalid={!!form.formState.errors.endDate}
                    {...form.register("endDate")}
                  />
                  <FieldError
                    errors={
                      form.formState.errors.endDate
                        ? [form.formState.errors.endDate]
                        : undefined
                    }
                  />
                </Field>
              </div>
            </FieldGroup>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="project-dialog-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? t("saving")
              : isEdit
                ? t("save")
                : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
