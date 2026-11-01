"use client";

import type { ReactNode } from "react";
import { ActionForm, Modal, Submit, FieldError, type ActionFn } from "./forms";
import { Button, Field, Input, Select, Textarea, buttonClass, cx } from "./ui";

export type FieldDef =
  | { name: string; label: string; type?: "text" | "number" | "date" | "email" | "tel" | "password"; required?: boolean; placeholder?: string; hint?: string; defaultValue?: string; step?: string; span?: 2 }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; hint?: string; defaultValue?: string; span?: 2; placeholder?: string }
  | { name: string; label: string; type: "textarea"; required?: boolean; hint?: string; defaultValue?: string; span?: 2; placeholder?: string }
  | { name: string; label: string; type: "checkbox"; hint?: string; defaultValue?: string; span?: 2 };

export function Fields({ fields, state }: { fields: FieldDef[]; state: Parameters<typeof FieldError>[0]["state"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.name} className={cx(f.span === 2 || f.type === "textarea" ? "sm:col-span-2" : "")}>
          {f.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={f.name} defaultChecked={f.defaultValue === "true"} className="h-4 w-4 accent-[var(--accent)]" />
              {f.label}
            </label>
          ) : (
            <Field label={f.label + ("required" in f && f.required ? " *" : "")} name={f.name} hint={f.hint}>
              {f.type === "select" ? (
                <Select name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""}>
                  <option value="">{f.placeholder ?? (f.required ? "Select…" : "— None —")}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea name={f.name} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} />
              ) : (
                <Input name={f.name} type={f.type === "number" ? "text" : f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} />
              )}
              <FieldError state={state} name={f.name} />
            </Field>
          )}
        </div>
      ))}
    </div>
  );
}

export function FormModal({ title, trigger, triggerVariant = "secondary", triggerSize = "sm", action, fields, hidden, submit = "Save", intro, wide, confirm, icon }: { title: string; trigger: ReactNode; triggerVariant?: "primary" | "secondary" | "ghost" | "gold" | "danger"; triggerSize?: "sm" | "md"; action: ActionFn; fields: FieldDef[]; hidden?: Record<string, string>; submit?: string; intro?: ReactNode; wide?: boolean; confirm?: string; icon?: ReactNode }) {
  return (
    <Modal
      title={title}
      wide={wide}
      trigger={(open) => (
        <Button type="button" variant={triggerVariant} size={triggerSize} onClick={open} aria-label={trigger ? undefined : title} title={trigger ? undefined : title}>
          {icon}
          {trigger}
        </Button>
      )}
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close} confirm={confirm} className="space-y-5">
          {(state) => (
            <>
              {intro && <div className="text-sm text-fg-2">{intro}</div>}
              {Object.entries(hidden ?? {}).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <Fields fields={fields} state={state} />
              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button type="button" className={buttonClass("ghost")} onClick={close}>
                  Cancel
                </button>
                <Submit variant={triggerVariant === "danger" ? "danger" : "primary"}>{submit}</Submit>
              </div>
            </>
          )}
        </ActionForm>
      )}
    </Modal>
  );
}

/** One-click action button (e.g., approve, archive) posting hidden fields. */
export function ActionButton({ action, hidden, children, variant = "secondary", confirm, size = "sm" }: { action: ActionFn; hidden: Record<string, string>; children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "gold" | "danger"; confirm?: string; size?: "sm" | "md" }) {
  return (
    <ActionForm action={action} confirm={confirm} className="inline">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit variant={variant} size={size}>
        {children}
      </Submit>
    </ActionForm>
  );
}

export function PageForm({ action, fields, hidden, submit = "Save", children }: { action: ActionFn; fields: FieldDef[]; hidden?: Record<string, string>; submit?: string; children?: ReactNode }) {
  return (
    <ActionForm action={action} className="space-y-6">
      {(state) => (
        <>
          {Object.entries(hidden ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Fields fields={fields} state={state} />
          {children}
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Submit>{submit}</Submit>
          </div>
        </>
      )}
    </ActionForm>
  );
}
