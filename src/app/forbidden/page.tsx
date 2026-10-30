import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <ShieldAlert className="mx-auto mb-4 text-warn" size={32} />
        <h1 className="text-lg font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-fg-2">Your role does not include access to this area. Access is granted by the account owner in Settings → Users &amp; roles. All access attempts are logged.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-accent">Return to overview</Link>
      </div>
    </div>
  );
}
