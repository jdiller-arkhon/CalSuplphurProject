import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { Card, Table, Badge, Stat } from "@/components/ui";
import { ActionButton, FormModal } from "@/components/form-modal";
import { inviteUser, cancelInvite, setUserRole, setUserActive, resetUserAccess } from "@/server/actions/admin";
import { MAX_ACTIVE_USERS } from "@/server/permissions";
import { InviteButton, RecoveryButton } from "./invite";

export const metadata = { title: "Users" };

export default async function Users() {
  const me = await requireUser("users.manage");
  const [users, invites] = await Promise.all([db.user.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] }), db.invitation.findMany({ where: { acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } })]);
  const active = users.filter((u) => u.active).length;
  const full = active + invites.length >= MAX_ACTIVE_USERS;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="People" action={<InviteButton action={inviteUser} disabled={full} />} pad={false}>
        <Table head={["Name", "Email", "Role", "Two-factor", "Last sign-in", "Status", ""]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.name}{u.id === me.id && <span className="ml-1.5 text-xs text-fg-3">(you)</span>}</td>
              <td className="text-fg-2">{u.email}</td>
              <td><Badge tone={u.role === "OWNER" ? "gold" : u.role === "MANAGER" ? "accent" : "neutral"}>{u.role}</Badge></td>
              <td>{u.mfaSecret ? <Badge tone="pos">on</Badge> : <Badge>off</Badge>}</td>
              <td className="text-fg-2">{u.lastLoginAt?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? "Never"}</td>
              <td>{u.active ? <Badge tone="pos" dot>active</Badge> : <Badge dot>deactivated</Badge>}</td>
              <td>
                {u.id !== me.id && (
                  <div className="row-actions flex justify-end gap-1">
                    <FormModal title={`Change role for ${u.name}`} trigger="Role" triggerVariant="ghost" action={setUserRole} hidden={{ id: u.id }} submit="Save" fields={[{ name: "role", label: "Role", type: "select", required: true, defaultValue: u.role, options: [{ value: "OWNER", label: "Owner" }, { value: "MANAGER", label: "Manager" }, { value: "VIEWER", label: "Viewer" }] }]} />
                    <RecoveryButton action={resetUserAccess} id={u.id} />
                    <ActionButton action={setUserActive} hidden={{ id: u.id, active: u.active ? "false" : "true" }} variant="ghost" confirm={u.active ? `Deactivate ${u.name}? They will be signed out immediately.` : undefined}>{u.active ? "Deactivate" : "Reactivate"}</ActionButton>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {invites.length > 0 && (
          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-3">Pending invitations</div>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{i.email} <Badge>{i.role}</Badge> <span className="text-xs text-fg-3">expires {i.expiresAt.toLocaleDateString("en-US")}</span></span>
                <ActionButton action={cancelInvite} hidden={{ id: i.id }} variant="ghost">Cancel</ActionButton>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Seats">
        <Stat label="Active users" value={`${active} of ${MAX_ACTIVE_USERS}`} />
        <Stat label="Pending invitations" value={invites.length} />
        <p className="mt-3 text-xs text-fg-3">Accounts are invitation-only; there is no public sign-up. CSC Command never emails links — you send them yourself.</p>
      </Card>
    </div>
  );
}
