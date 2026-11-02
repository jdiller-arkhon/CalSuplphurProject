import { Badge, type Tone } from "@/components/ui";
const MAP: Record<string, [string, Tone]> = { DRAFT: ["Draft", "neutral"], ISSUED: ["Unpaid", "accent"], PARTIALLY_PAID: ["Part paid", "gold"], PAID: ["Paid", "pos"], VOID: ["Void", "neutral"] };
export function InvoiceStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue && (status === "ISSUED" || status === "PARTIALLY_PAID")) return <span className="pulse-dot"><Badge tone="crit" dot>Overdue</Badge></span>;
  const [label, tone] = MAP[status] ?? [status, "neutral"];
  return <Badge tone={tone} dot={status !== "VOID"}>{label}</Badge>;
}
