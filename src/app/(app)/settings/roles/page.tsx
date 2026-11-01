import { requireUser, permissionsFor } from "@/server/auth";
import { Card, Badge } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { ActionButton } from "@/components/form-modal";
import { saveRolePermissions, resetRolePermissions } from "@/server/actions/admin";
import { PERMISSIONS, LOCKED_OWNER, type Permission } from "@/server/permissions";

export const metadata = { title: "Roles" };

export default async function Roles() {
  await requireUser("users.manage");
  const [mgr, viewer] = await Promise.all([permissionsFor("MANAGER"), permissionsFor("VIEWER")]);
  const all = Object.entries(PERMISSIONS) as [Permission, string][];
  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <Card title="Owner">
        <p className="mb-3 text-sm text-fg-2">Owners have every permission. This can't be changed, so the business can never be locked out.</p>
        <ul className="space-y-1.5 text-sm">{all.map(([k, d]) => <li key={k} className="flex gap-2"><span className="text-pos">✓</span>{d}</li>)}</ul>
      </Card>
      {([["MANAGER", mgr], ["VIEWER", viewer]] as const).map(([role, set]) => (
        <Card key={role} title={role === "MANAGER" ? "Manager" : "Viewer"} action={<ActionButton action={resetRolePermissions} hidden={{ role }} variant="ghost" confirm="Restore default permissions for this role?">Reset to defaults</ActionButton>}>
          <ActionForm action={saveRolePermissions} className="space-y-4">
            <input type="hidden" name="role" value={role} />
            <ul className="space-y-2">
              {all.filter(([k]) => !LOCKED_OWNER.includes(k)).map(([k, d]) => (
                <li key={k}><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="perms[]" value={k} defaultChecked={set.has(k)} className="mt-0.5 accent-[var(--accent)]" /><span>{d}</span></label></li>
              ))}
            </ul>
            <p className="text-xs text-fg-3">User management, company settings and the audit log stay owner-only. <Badge>enforced on the server</Badge></p>
            <div className="flex justify-end border-t border-line pt-4"><Submit>Save {role.toLowerCase()} permissions</Submit></div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
