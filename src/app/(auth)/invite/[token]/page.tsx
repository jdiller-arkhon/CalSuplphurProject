import { db } from "@/server/db";
import { sha256 } from "@/server/auth";
import { acceptInviteAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-forms";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date())
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-fg-2">This link is invalid, already used, or expired. Ask the account owner to send a new invitation.</p>
      </>
    );
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Join CSC Command</h1>
      <p className="mb-7 mt-1 text-sm text-fg-2">
        Invited as <b className="capitalize">{inv.role.toLowerCase()}</b> · {inv.email}
      </p>
      <AuthForm action={acceptInviteAction} submit="Create account" hidden={{ token }} fields={[{ name: "name", label: "Full name", autoComplete: "name" }, { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 12 characters, with a number or symbol." }]} />
    </>
  );
}
