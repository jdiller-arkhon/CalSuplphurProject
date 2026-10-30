import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { setupOwnerAction } from "@/server/auth-actions";
import { AuthForm } from "@/components/auth-forms";

export const metadata = { title: "Create owner account" };

export default async function FirstRun() {
  if ((await db.user.count()) > 0) redirect("/login");
  const prod = process.env.NODE_ENV === "production";
  return (
    <>
      <div className="mb-2 inline-flex rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold">First-run setup</div>
      <h1 className="text-xl font-semibold tracking-tight">Create the owner account</h1>
      <p className="mb-7 mt-1 text-sm text-fg-2">This account administers CSC Command. Public registration is disabled; additional users join by invitation only.</p>
      <AuthForm
        action={setupOwnerAction}
        submit="Create owner account"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Work email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 12 characters, with a number or symbol." },
          ...(prod ? [{ name: "setupToken", label: "Setup token", type: "password", hint: "The SETUP_TOKEN value from your deployment configuration." }] : []),
        ]}
      />
    </>
  );
}
