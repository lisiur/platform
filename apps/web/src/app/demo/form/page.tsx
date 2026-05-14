"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  country: z.string().min(1, "Please select a country"),
  preference: z.enum(["email", "sms", "push"], {
    error: "Please select a preference",
  }),
  interests: z.array(z.string()).min(1, "Please select at least one interest"),
  birthDate: z.date({ error: "Please select a birth date" }),
  dateRangeStart: z.date({ error: "Please select a start date" }),
  dateRangeEnd: z.date({ error: "Please select an end date" }),
  terms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the terms",
  }),
  avatar: z.any().optional(),
});

type FormInput = z.infer<typeof formSchema>;

const countryKeys = ["us", "uk", "ca", "au", "de", "fr", "jp", "cn"] as const;
const interestKeys = ["tech", "design", "music", "travel", "sports"] as const;

export default function FormDemoPage() {
  const t = useTranslations("FormDemo");

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      bio: "",
      country: "",
      preference: "email",
      interests: [],
      birthDate: new Date(),
      dateRangeStart: new Date(),
      dateRangeEnd: new Date(),
      terms: false,
    },
  });

  const dateRangeStart = form.watch("dateRangeStart");
  const dateRangeEnd = form.watch("dateRangeEnd");
  const formValues = form.watch();

  function onSubmit(data: FormInput) {
    toast("You submitted the following values:", {
      description: (
        <pre className="mt-2 w-[320px] overflow-x-auto rounded-md bg-code p-4 text-code-foreground">
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
      position: "bottom-right",
      classNames: {
        content: "flex flex-col gap-2",
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center p-8">
      <h1 className="mb-2 text-xl font-semibold">{t("title")}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t("description")}</p>

      <div className="flex w-full max-w-5xl gap-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>{t("registrationForm")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="form-demo" onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-demo-name">
                        {t("nameLabel")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-demo-name"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("namePlaceholder")}
                        autoComplete="name"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-demo-email">
                        {t("emailLabel")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-demo-email"
                        type="email"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("emailPlaceholder")}
                        autoComplete="email"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-demo-password">
                        {t("passwordLabel")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-demo-password"
                        type="password"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("passwordPlaceholder")}
                        autoComplete="new-password"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="bio"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-demo-bio">
                        {t("bioLabel")}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupTextarea
                          {...field}
                          value={field.value ?? ""}
                          id="form-demo-bio"
                          placeholder={t("bioPlaceholder")}
                          rows={4}
                          className="min-h-24 resize-none"
                          aria-invalid={fieldState.invalid}
                        />
                        <InputGroupAddon align="block-end">
                          <InputGroupText className="tabular-nums">
                            {(field.value ?? "").length}/500 characters
                          </InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="country"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>{t("countryLabel")}</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          aria-invalid={fieldState.invalid}
                          className="min-w-[120px]"
                        >
                          <SelectValue placeholder={t("countryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {countryKeys.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`countries.${key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="preference"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <FieldSet>
                      <FieldLegend variant="label">
                        {t("notificationPreference")}
                      </FieldLegend>
                      <RadioGroup
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FieldLabel htmlFor="email-pref">
                          <Field
                            orientation="horizontal"
                            data-invalid={fieldState.invalid}
                          >
                            <RadioGroupItem
                              value="email"
                              id="email-pref"
                              aria-invalid={fieldState.invalid}
                            />
                            <span className="font-normal">
                              {t("emailNotifications")}
                            </span>
                          </Field>
                        </FieldLabel>
                        <FieldLabel htmlFor="sms-pref">
                          <Field
                            orientation="horizontal"
                            data-invalid={fieldState.invalid}
                          >
                            <RadioGroupItem
                              value="sms"
                              id="sms-pref"
                              aria-invalid={fieldState.invalid}
                            />
                            <span className="font-normal">
                              {t("smsNotifications")}
                            </span>
                          </Field>
                        </FieldLabel>
                        <FieldLabel htmlFor="push-pref">
                          <Field
                            orientation="horizontal"
                            data-invalid={fieldState.invalid}
                          >
                            <RadioGroupItem
                              value="push"
                              id="push-pref"
                              aria-invalid={fieldState.invalid}
                            />
                            <span className="font-normal">
                              {t("pushNotifications")}
                            </span>
                          </Field>
                        </FieldLabel>
                      </RadioGroup>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </FieldSet>
                  )}
                />

                <Controller
                  name="interests"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <FieldSet>
                      <FieldLegend variant="label">
                        {t("interestsLabel")}
                      </FieldLegend>
                      <FieldGroup data-slot="checkbox-group">
                        {interestKeys.map((key) => (
                          <Field
                            key={key}
                            orientation="horizontal"
                            data-invalid={fieldState.invalid}
                          >
                            <Checkbox
                              id={`interest-${key}`}
                              name={field.name}
                              aria-invalid={fieldState.invalid}
                              checked={field.value.includes(key)}
                              onCheckedChange={(checked) => {
                                const newValue = checked
                                  ? [...field.value, key]
                                  : field.value.filter((v) => v !== key);
                                field.onChange(newValue);
                              }}
                            />
                            <FieldLabel
                              htmlFor={`interest-${key}`}
                              className="font-normal"
                            >
                              {t(`interests.${key}`)}
                            </FieldLabel>
                          </Field>
                        ))}
                      </FieldGroup>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </FieldSet>
                  )}
                />

                <Controller
                  name="birthDate"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>{t("birthDateLabel")}</FieldLabel>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Field>
                  <FieldLabel>{t("dateRangeLabel")}</FieldLabel>
                  <DateRangePicker
                    startDate={dateRangeStart}
                    endDate={dateRangeEnd}
                    onChange={(range) => {
                      form.setValue(
                        "dateRangeStart",
                        range?.from ?? new Date(),
                        {
                          shouldValidate: true,
                        },
                      );
                      form.setValue("dateRangeEnd", range?.to ?? new Date(), {
                        shouldValidate: true,
                      });
                    }}
                  />
                  {(form.formState.errors.dateRangeStart ||
                    form.formState.errors.dateRangeEnd) && (
                    <FieldError
                      errors={[
                        form.formState.errors.dateRangeStart,
                        form.formState.errors.dateRangeEnd,
                      ]}
                    />
                  )}
                </Field>

                <Controller
                  name="avatar"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-demo-avatar">
                        {t("avatarLabel")}
                      </FieldLabel>
                      <Input
                        id="form-demo-avatar"
                        type="file"
                        accept="image/*"
                        name={field.name}
                        ref={field.ref}
                        onChange={(e) => field.onChange(e.target.files?.[0])}
                      />
                      <FieldDescription>{t("avatarHint")}</FieldDescription>
                    </Field>
                  )}
                />

                <Controller
                  name="terms"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <Field orientation="horizontal">
                        <Checkbox
                          id="terms"
                          name={field.name}
                          aria-invalid={fieldState.invalid}
                          checked={field.value}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true)
                          }
                        />
                        <FieldLabel htmlFor="terms" className="font-normal">
                          {t("termsLabel")}
                        </FieldLabel>
                      </Field>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter>
            <Field orientation="horizontal">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
              >
                {t("reset")}
              </Button>
              <Button
                type="submit"
                form="form-demo"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? t("submitting") : t("submit")}
              </Button>
            </Field>
          </CardFooter>
        </Card>

        <Card className="sticky top-[calc(var(--header-height)+1rem)] w-full max-w-lg self-start">
          <CardHeader>
            <CardTitle>{t("formValues")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              suppressHydrationWarning
              className="max-h-[600] overflow-auto rounded-md bg-muted p-4 text-xs"
            >
              {JSON.stringify(
                formValues,
                (_key, value) =>
                  value instanceof Date ? value.toISOString() : value,
                2,
              )}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
