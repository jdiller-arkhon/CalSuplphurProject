import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, Badge, Table } from "@/components/ui";
import { FormModal } from "@/components/form-modal";
import { changePasswordAction, startMfaAction, confirmMfaAction, disableMfaAction } from "@/server/auth-actions";
import { MfaSetup } from "./mfa";

export const metadata = { title: "Security" };

export default async function Security() {
  const u = await requireUser();
  const sessions = await db.session.findMany({ where: { userId: u.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card title="Two-factor sign-in" action={u.mfaEnabled ? <Badge tone="pos" dot>on</Badge> : <Badge dot>off</Badge>}>
        {u.mfaEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-2">Signing in asks for a 6-digit code from your authenticator app.</p>
            <FormModal title="Turn off two-factor sign-in" trigger="Turn off" triggerVariant="secondary" action={disableMfaAction} submit="Turn off" fields={[{ name: "password", label: "Confirm your password", type: "password", required: true }]} />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-fg-2">Adds a code from your phone at sign-in, so a stolen password alone can't get in. Strongly recommended for owners.</p>
            <MfaSetup start={startMfaAction} confirm={confirmMfaAction} />
          </div>
        )}
      </Card>
      <Card title="Password">
        <p className="mb-3 text-sm text-fg-2">At least 12 characters, including a number or symbol.</p>
        <FormModal title="Change password" trigger="Change password" triggerVariant="secondary" action={changePasswordAction} submit="Update" fields={[{ name: "current", label: "Current password", type: "password", required: true }, { name: "next", label: "New password", type: "password", required: true }]} />
      </Card>
      <Card className="xl:col-span-2" title="Active sessions" pad={false}>
        <Table head={["Signed in", "Expires", "IP address", "Device"]}>
          {sessions.map((s) => <tr key={s.id}><td>{s.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td><td className="text-fg-2">{s.expiresAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td><td className="text-fg-2">{s.ip ?? "—"}</td><td className="max-w-[420px] truncate text-xs text-fg-3">{s.userAgent ?? "—"}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}
