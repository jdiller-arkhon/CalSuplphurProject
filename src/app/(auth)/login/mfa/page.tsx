import { redirect } from "next/navigation";
import { pendingMfaUser } from "@/server/auth";
import { mfaAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-forms";

export const metadata = { title: "Verify" };

export default async function MfaPage() {
  if (!(await pendingMfaUser())) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Two-factor verification</h1>
      <p className="mb-7 mt-1 text-sm text-fg-2">Enter the 6-digit code from your authenticator app.</p>
      <AuthForm action={mfaAction} submit="Verify" fields={[{ name: "code", label: "Authentication code", autoComplete: "one-time-code", inputMode: "numeric" }]} />
    </>
  );
}
