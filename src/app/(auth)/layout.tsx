export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(var(--sidebar-text) 1px, transparent 1px), linear-gradient(90deg, var(--sidebar-text) 1px, transparent 1px)", backgroundSize: "44px 44px" }} aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-[#a37c3c] text-xs font-bold text-sidebar">S</div>
            <span className="text-sm font-semibold tracking-tight text-white">CSC Command</span>
          </div>
          <div>
            <p className="max-w-md text-[28px] font-semibold leading-tight tracking-tight text-white">Inventory, pricing and profitability — one precise view of the business.</p>
            <p className="mt-4 max-w-sm text-sm text-sidebar-fg/80">Private operations platform for California Sulphur Company. Authorized personnel only.</p>
          </div>
          <div className="flex gap-8 text-xs text-sidebar-fg/60">
            <span>Wilmington, California</span>
            <span>Encrypted · Audited · Invitation-only</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
