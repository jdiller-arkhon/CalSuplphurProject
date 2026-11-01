import { NextResponse } from "next/server";
import { authorize, AuthError } from "@/server/auth";
import { marketGuide } from "@/server/services/market";

/** Market-rate guide for Pricing Studio. All money in USD per the product's unit, as strings (exact decimals). */
export async function GET(req: Request) {
  try { await authorize("pricing.use"); } catch (e) { return NextResponse.json({ error: e instanceof AuthError ? e.message : "Not authorized" }, { status: 403 }); }
  const id = new URL(req.url).searchParams.get("product");
  if (!id) return NextResponse.json({ error: "product required" }, { status: 400 });
  const g = await marketGuide(id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
  return NextResponse.json({
    unit: g.product.unit, confidence: g.confidence, ageDays: g.ageDays, trend: s(g.trend),
    suggested: g.suggested && { low: s(g.suggested.low), mid: s(g.suggested.mid), high: s(g.suggested.high), source: g.suggested.source },
    marketCount: g.market?.count ?? 0, salesMedian: s(g.sales?.median), floor: s(g.floor),
  }, { headers: { "cache-control": "no-store" } });
}
