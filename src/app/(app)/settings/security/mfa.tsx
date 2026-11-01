"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { ActionForm, Submit, type ActionFn } from "@/components/forms";
import { Button, Field, Input } from "@/components/ui";

export function MfaSetup({ start, confirm }: { start: () => Promise<{ secret: string; uri: string } | { error: string }>; confirm: ActionFn }) {
  const [qr, setQr] = useState<{ img: string; secret: string } | null>(null);
  const [pending, go] = useTransition();
  if (!qr)
    return <Button disabled={pending} onClick={() => go(async () => { const r = await start(); if ("secret" in r) setQr({ img: await QRCode.toDataURL(r.uri, { margin: 1, width: 200 }), secret: r.secret }); })}><ShieldCheck size={14} /> Turn on two-factor sign-in</Button>;
  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.img} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border border-line bg-white p-2" />
      <div className="min-w-[240px] flex-1 space-y-3">
        <p className="text-sm text-fg-2">Scan with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), or enter this key: <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 text-xs">{qr.secret}</code></p>
        <ActionForm action={confirm} className="flex items-end gap-2">
          <Field label="6-digit code" name="code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required className="w-36" /></Field>
          <Submit>Confirm</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
