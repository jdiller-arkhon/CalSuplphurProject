"use server";

import { authorize } from "../auth";
import { db } from "../db";
import { audit, log } from "../audit";
import { rateLimit } from "../ratelimit";
import { askInsights, assistantStatus, type InsightAnswer } from "../services/insights";
import { setSetting } from "../services/settings";

export async function ask(question: string): Promise<InsightAnswer | { error: string }> {
  try {
    const u = await authorize();
    const st = await assistantStatus();
    if (!st.enabled) return { error: "CSC Insights is turned off. An owner can turn it on under Insights." };
    if (!st.ready) return { error: st.reason ?? "The local model isn't available." };
    if (!question.trim()) return { error: "Type a question." };
    if (!(await rateLimit(`insights:${u.id}`, 30, 10 * 60_000))) return { error: "Too many questions in a short time. Try again in a few minutes." };
    const r = await askInsights(question, u);
    await audit(db, { userId: u.id, action: "insights.ask", entity: "Insights", summary: `Asked: ${question.slice(0, 200)}`, data: { tool: r.tool ?? null } });
    return r;
  } catch (e) {
    log("error", "insights failed", { err: String(e) });
    return { error: "The assistant couldn't answer. Nothing was changed." };
  }
}

export async function setAssistantEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const u = await authorize("settings.manage").catch(() => null);
  if (!u) return { ok: false, error: "Only an owner can change this." };
  await setSetting(db, "ai.enabled", enabled);
  await audit(db, { userId: u.id, action: "insights.toggle", entity: "AppSetting", summary: `${enabled ? "Turned on" : "Turned off"} CSC Insights (local model)` });
  return { ok: true };
}
