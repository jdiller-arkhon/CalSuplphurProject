"use client";

import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, Submit, Modal, type ActionFn } from "@/components/forms";
import { Button, Field, Input, Select, buttonClass } from "@/components/ui";

export function InviteButton({ action, disabled }: { action: ActionFn; disabled?: boolean }) {
  return (
    <Modal title="Invite a user" trigger={(open) => <Button onClick={open} disabled={disabled} title={disabled ? "The 3-user limit is reached" : undefined}><UserPlus size={14} /> Invite user</Button>}>
      {(close) => <LinkForm action={action} close={close} fields />}
    </Modal>
  );
}

export function LinkForm({ action, close, fields, hidden }: { action: ActionFn; close: () => void; fields?: boolean; hidden?: Record<string, string> }) {
  const [link, setLink] = useState<string | null>(null);
  if (link)
    return (
      <div className="space-y-4">
        <p className="text-sm text-fg-2">Send this link to the person yourself (email, text). It works once.</p>
        <div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" /><Button type="button" variant="secondary" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}><Copy size={14} /> Copy</Button></div>
        <div className="flex justify-end"><button type="button" className={buttonClass("primary")} onClick={close}>Done</button></div>
      </div>
    );
  return (
    <ActionForm action={action} onSuccess={(s) => setLink((s?.data as { link?: string })?.link ?? null)} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields && (
        <>
          <Field label="Email *" name="email"><Input name="email" type="email" required /></Field>
          <Field label="Role *" name="role" hint="Managers run day-to-day work. Viewers see stock and shipments only."><Select name="role" defaultValue="MANAGER"><option value="MANAGER">Manager</option><option value="VIEWER">Viewer</option><option value="OWNER">Owner</option></Select></Field>
        </>
      )}
      {!fields && <p className="text-sm text-fg-2">This signs the user out, clears their two-factor setup, and creates a one-time link (valid 24 hours) for them to set a new password.</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={buttonClass("ghost")} onClick={close}>Cancel</button><Submit>{fields ? "Create invitation link" : "Create recovery link"}</Submit></div>
    </ActionForm>
  );
}

export function RecoveryButton({ action, id }: { action: ActionFn; id: string }) {
  return <Modal title="Account recovery" trigger={(open) => <Button variant="ghost" size="sm" onClick={open}>Reset access</Button>}>{(close) => <LinkForm action={action} close={close} hidden={{ id }} />}</Modal>;
}
