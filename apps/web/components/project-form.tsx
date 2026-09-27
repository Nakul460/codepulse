"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUSES, STATUS_LABELS } from "@/lib/project-status";
import { ProjectType } from "@/types/project-type";

const PROJECT_NAME_MAX = 120;

interface ProjectFormProps {
  defaultValues: ProjectType;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: ProjectType) => void | Promise<void>;
  onCancel: () => void;
  idPrefix: string;
}

export function ProjectForm({
  defaultValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  idPrefix,
}: ProjectFormProps) {
  const form = useForm<ProjectType>({ defaultValues });

  const { errors } = form.formState;

  // Move focus to the first invalid control so keyboard and screen-reader
  // users are not left guessing after a failed submit.
  useEffect(() => {
    const firstError = Object.keys(errors)[0] as keyof ProjectType | undefined;
    if (!firstError) {
      return;
    }
    const field = form.getFieldState(firstError);
    if (!field.invalid) {
      return;
    }
    const element = document.getElementById(`${idPrefix}-${firstError}`);
    element?.focus();
  }, [errors, form, idPrefix]);

  // Guard against losing edits to a dialog that is about to close.
  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (form.formState.isDirty) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form, isSubmitting]);

  function handleCancel() {
    if (
      form.formState.isDirty &&
      !window.confirm("Discard your unsaved changes?")
    ) {
      return;
    }
    onCancel();
  }

  return (
    <form
      id="project-form"
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      <FieldGroup>
        <Controller
          control={form.control}
          name="projectName"
          render={({ field }) => (
            <Field data-invalid={!!errors.projectName}>
              <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-name`}
                name="projectName"
                maxLength={PROJECT_NAME_MAX}
                placeholder="Apollo migration…"
                aria-invalid={!!errors.projectName}
                aria-describedby={
                  errors.projectName ? `${idPrefix}-name-error` : undefined
                }
              />
              {errors.projectName && (
                <FieldError id={`${idPrefix}-name-error`}>
                  {errors.projectName.message}
                </FieldError>
              )}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-status`}>Status</FieldLabel>
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value ?? "ongoing")}
              >
                <SelectTrigger id={`${idPrefix}-status`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Select a Status</SelectLabel>
                    {PROJECT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status] ?? status}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <DatePicker
              id={`${idPrefix}-startDate`}
              label="Start Date"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          control={form.control}
          name="endDate"
          render={({ field }) => (
            <DatePicker
              id={`${idPrefix}-endDate`}
              label="End Date"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          control={form.control}
          name="budget"
          render={({ field }) => (
            <Field
              data-invalid={!!errors.budget}
              className="max-w-48"
            >
              <FieldLabel htmlFor={`${idPrefix}-budget`}>Budget</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-budget`}
                name="budget"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={Number.isNaN(field.value) ? "" : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                placeholder="0"
                aria-invalid={!!errors.budget}
                aria-describedby={
                  errors.budget ? `${idPrefix}-budget-error` : undefined
                }
              />
              {errors.budget && (
                <FieldError id={`${idPrefix}-budget-error`}>
                  {errors.budget.message}
                </FieldError>
              )}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-description`}>
                Description
              </FieldLabel>
              <Textarea
                {...field}
                id={`${idPrefix}-description`}
                name="description"
                placeholder="What is this project about?…"
                rows={3}
              />
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
