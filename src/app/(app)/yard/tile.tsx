"use client";

import type { ReactNode } from "react";
import { ActionForm, Modal, Submit, type ActionFn } from "@/components/forms";
import { Fields, type FieldDef } from "@/components/form-modal";
import { buttonClass, cx } from "@/components/ui";

/** Large touch target that opens a form — for use on a tablet in the yard or scale house. */
export function YardTile({ title, subtitle, icon, tone, action, fields, hidden, submit }: { title: string; subtitle: string; icon: ReactNode; tone: "accent" | "gold" | "pos" | "neutral"; action: ActionFn; fields: FieldDef[]; hidden?: Record<string, string>; submit: string }) {
  const toneCls = { accent: "from-[#2422a0] to-[#284866] text-white", gold: "from-[#d9b26e] to-[#c9b21c] text-[#1e2a3a]", pos: "from-[#1c9a7b] to-[#127058] text-white", neutral: "from-[#26354a] to-[#1e2a3a] text-white" }[tone];
  return (
    <Modal title={title} wide trigger={(open) => (
      <button onClick={open} className={cx("rise flex min-h-[180px] w-full flex-col justify-between rounded-2xl bg-gradient-to-br p-7 text-left shadow-[var(--shadow-lg)] transition active:scale-[0.98]", toneCls)}>
        <span className="opacity-90">{icon}</span>
        <span><span className="block text-[26px] font-semibold leading-tight">{title}</span><span className="mt-1 block text-[15px] opacity-80">{subtitle}</span></span>
      </button>
    )}>
      {(close) => (
        <ActionForm action={action} onSuccess={close} className="space-y-5 [&_input]:h-12 [&_input]:text-base [&_select]:h-12 [&_select]:text-base">
          {(s) => (
            <>
              {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <Fields fields={fields} state={s} />
              <div className="flex justify-end gap-3 border-t border-line pt-4"><button type="button" onClick={close} className={cx(buttonClass("ghost"), "h-12 px-6 text-base")}>Cancel</button><Submit className="h-12 px-8 text-base">{submit}</Submit></div>
            </>
          )}
        </ActionForm>
      )}
    </Modal>
  );
}
