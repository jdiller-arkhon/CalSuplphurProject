"use client";
import type { ReactNode } from "react";
import { Monitor, Sun, Moon, Rows3, Rows4, Sparkles, Wind, CircleOff, PanelTop, PanelTopDashed, Minus, Keyboard, Hand, Pin, EyeOff, RotateCcw } from "lucide-react";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Select } from "@/components/ui";
import { ACCENTS, type Prefs } from "@/lib/prefs";
import { savePreferences, resetPreferences } from "@/server/actions/prefs";

type Page = { href: string; label: string; group: string };

/** Applies a choice instantly so the page itself is the preview; saving makes it stick. */
function preview(name: string, value: string) {
  const h = document.documentElement;
  const frame = document.querySelector<HTMLElement>("[data-accent]:not(html)");
  const set = (k: string) => { h.dataset[k] = value; if (frame) frame.dataset[k] = value; };
  if (name === "theme") h.setAttribute("data-theme", value === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value);
  if (name === "accent" || name === "density" || name === "motion" || name === "hero") set(name);
  if (name === "textSize") h.style.fontSize = value === "100" ? "" : `${value}%`;
}

function Choice({ name, value, current, icon, label, hint, swatch }: { name: string; value: string; current: string; icon?: ReactNode; label: string; hint?: string; swatch?: string }) {
  return (
    <label className="pref-opt">
      <input type="radio" name={name} value={value} defaultChecked={current === value} onChange={() => preview(name, value)} />
      <span>
        {swatch ? <i className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/60" style={{ background: swatch }} /> : icon}
        <span className="min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-xs text-fg-3">{hint}</span>}</span>
      </span>
    </label>
  );
}
const Group = ({ title, hint, children, cols = 3 }: { title: string; hint?: string; children: ReactNode; cols?: number }) => (
  <fieldset className="mb-6 last:mb-0">
    <legend className="mb-1 text-sm font-semibold">{title}</legend>
    {hint && <p className="mb-2.5 text-xs text-fg-3">{hint}</p>}
    <div className={`grid gap-2 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : cols === 4 ? "lg:grid-cols-4" : ""}`}>{children}</div>
  </fieldset>
);

export function PreferencesForm({ prefs, pages }: { prefs: Prefs; pages: Page[] }) {
  return (
    <div className="space-y-6">
      <ActionForm action={savePreferences} className="grid items-start gap-6 xl:grid-cols-2">
        <Card title="Appearance">
          <Group title="Theme">
            <Choice name="theme" value="system" current={prefs.theme} icon={<Monitor size={16} />} label="Match device" />
            <Choice name="theme" value="light" current={prefs.theme} icon={<Sun size={16} />} label="Light" />
            <Choice name="theme" value="dark" current={prefs.theme} icon={<Moon size={16} />} label="Dark" />
          </Group>
          <Group title="Accent colour" hint="Buttons, links, charts and highlights." cols={3}>
            {Object.entries(ACCENTS).map(([k, a]) => <Choice key={k} name="accent" value={k} current={prefs.accent} swatch={a.light} label={a.label} />)}
          </Group>
          <Group title="Text size" cols={4}>
            {[["90", "Small"], ["100", "Default"], ["110", "Large"], ["120", "Larger"]].map(([v, l]) => <Choice key={v} name="textSize" value={v} current={prefs.textSize} label={l} icon={<span className="w-5 text-center font-semibold" style={{ fontSize: `${Number(v) / 7}px` }}>A</span>} />)}
          </Group>
          <Group title="Density" cols={2}>
            <Choice name="density" value="comfortable" current={prefs.density} icon={<Rows3 size={16} />} label="Comfortable" hint="More breathing room" />
            <Choice name="density" value="compact" current={prefs.density} icon={<Rows4 size={16} />} label="Compact" hint="More rows on screen" />
          </Group>
        </Card>

        <Card title="Motion & page headers">
          <Group title="Animation">
            <Choice name="motion" value="full" current={prefs.motion} icon={<Sparkles size={16} />} label="Full" hint="Scenes, sparks, tilt" />
            <Choice name="motion" value="subtle" current={prefs.motion} icon={<Wind size={16} />} label="Subtle" hint="Entrances only" />
            <Choice name="motion" value="off" current={prefs.motion} icon={<CircleOff size={16} />} label="Off" hint="Everything still" />
          </Group>
          <Group title="Page header style">
            <Choice name="hero" value="full" current={prefs.hero} icon={<PanelTop size={16} />} label="Full hero" hint="Large, with artwork" />
            <Choice name="hero" value="compact" current={prefs.hero} icon={<PanelTopDashed size={16} />} label="Compact" hint="Smaller artwork" />
            <Choice name="hero" value="minimal" current={prefs.hero} icon={<Minus size={16} />} label="Minimal" hint="Slim bar, no art" />
          </Group>
          <Group title="Sidebar" cols={2}>
            <Choice name="sidebar" value="expanded" current={prefs.sidebar} label="Expanded" hint="Icons and labels" />
            <Choice name="sidebar" value="collapsed" current={prefs.sidebar} label="Icons only" hint="Press [ to toggle" />
          </Group>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="shortcuts" defaultChecked={prefs.shortcuts} className="h-4 w-4 accent-[var(--accent)]" /><Keyboard size={15} className="text-fg-3" /> Keyboard shortcuts <span className="text-xs text-fg-3">(press ? to see them)</span></label>
            <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" name="greeting" defaultChecked={prefs.greeting} className="h-4 w-4 accent-[var(--accent)]" /><Hand size={15} className="text-fg-3" /> Personal greeting on Overview</label>
          </div>
        </Card>

        <Card title="Navigation" className="xl:col-span-2">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <label className="mb-1 block text-sm font-semibold" htmlFor="landing">Start page</label>
              <p className="mb-2 text-xs text-fg-3">Where you land after signing in.</p>
              <Select name="landing" defaultValue={prefs.landing}>
                {pages.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
              </Select>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">Sidebar pages</div>
              <p className="mb-2 text-xs text-fg-3">Pin up to 6 favourites to the top, or hide pages you never use. Hidden pages stay reachable by search.</p>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-fg-3"><tr><th className="px-3 py-2 font-semibold">Page</th><th className="px-3 py-2 font-semibold">Section</th><th className="px-3 py-2 text-center font-semibold"><Pin size={12} className="inline" /> Pin</th><th className="px-3 py-2 text-center font-semibold"><EyeOff size={12} className="inline" /> Hide</th></tr></thead>
                  <tbody>
                    {pages.map((p) => (
                      <tr key={p.href} className="border-t border-line">
                        <td className="px-3 py-1.5 font-medium">{p.label}</td>
                        <td className="px-3 py-1.5 text-fg-3">{p.group}</td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" name="pinned[]" value={p.href} defaultChecked={prefs.pinned.includes(p.href)} aria-label={`Pin ${p.label}`} className="h-4 w-4 accent-[var(--accent)]" /></td>
                        <td className="px-3 py-1.5 text-center">{p.href === "/" ? <span className="text-xs text-fg-3">—</span> : <input type="checkbox" name="hiddenNav[]" value={p.href} defaultChecked={prefs.hiddenNav.includes(p.href)} aria-label={`Hide ${p.label}`} className="h-4 w-4 accent-[var(--accent)]" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
        <div className="flex items-center gap-3 xl:col-span-2">
          <Submit>Save preferences</Submit>
          <span className="text-xs text-fg-3">Changes preview instantly. Saved preferences follow you to any device.</span>
        </div>
      </ActionForm>
      <ActionForm action={resetPreferences} confirm="Reset all your preferences, sidebar and Overview layout to defaults?">
        <Submit variant="ghost" size="sm"><RotateCcw size={14} /> Reset to defaults</Submit>
      </ActionForm>
    </div>
  );
}
