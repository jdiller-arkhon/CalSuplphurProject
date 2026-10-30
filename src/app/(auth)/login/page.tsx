import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth";
import { loginAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  if ((await db.user.count()) === 0) redirect("/first-run");
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-7 mt-1 text-sm text-fg-2">Use the credentials from your invitation.</p>
      <AuthForm action={loginAction} submit="Sign in" fields={[{ name: "email", label: "Email", type: "email", autoComplete: "username" }, { name: "password", label: "Password", type: "password", autoComplete: "current-password" }]} />
      <p className="mt-6 text-xs text-fg-3">Forgot your password? Ask the account owner to issue a reset invitation from Settings → Users. <Link className="underline" href="/forbidden">Access policy</Link></p>
    </>
  );
}
