"use client";

import { ActionForm, Submit, type ActionFn } from "./forms";
import { Field, Input } from "./ui";

export function AuthForm({ action, fields, submit, hidden }: { action: ActionFn; fields: { name: string; label: string; type?: string; autoComplete?: string; hint?: string; inputMode?: "numeric" }[]; submit: string; hidden?: Record<string, string> }) {
  return (
    <ActionForm action={action} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f, i) => (
        <Field key={f.name} label={f.label} name={f.name} hint={f.hint}>
          <Input name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} inputMode={f.inputMode} required autoFocus={i === 0} className="h-10" />
        </Field>
      ))}
      <Submit className="h-10 w-full">{submit}</Submit>
    </ActionForm>
  );
}
