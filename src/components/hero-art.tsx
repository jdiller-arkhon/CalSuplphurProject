"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const G = "#e5d33a", GL = "#f4ea8a", B = "#aba9f2", W = "rgba(255,255,255,.14)";
const d = (s: number) => ({ animationDelay: `${s}s` });

function Defs() {
  return (
    <defs>
      <radialGradient id="ha-atom" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fbf5b8" /><stop offset=".55" stopColor={G} /><stop offset="1" stopColor="#6e6210" /></radialGradient>
      <linearGradient id="ha-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GL} /><stop offset="1" stopColor="#a8961a" /></linearGradient>
      <linearGradient id="ha-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a57d8" /><stop offset="1" stopColor="#23215e" /></linearGradient>
      <radialGradient id="ha-halo"><stop offset="0" stopColor="rgba(229,211,58,.32)" /><stop offset="1" stopColor="rgba(229,211,58,0)" /></radialGradient>
    </defs>
  );
}

/* Sulphur S8 ring — overview / default */
function Ring() {
  const at = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return { x: 160 + Math.cos(a) * 92, y: 160 + Math.sin(a) * 92 * (i % 2 ? 0.86 : 1) }; });
  return (<>
    <g className="ha-spin-12"><ellipse cx="160" cy="160" rx="148" ry="54" fill="none" stroke={W} /><circle cx="308" cy="160" r="3.5" fill={GL} /></g>
    <g className="ha-spin-18r"><ellipse cx="160" cy="160" rx="54" ry="148" fill="none" stroke="rgba(255,255,255,.08)" /><circle cx="160" cy="12" r="2.5" fill={B} /></g>
    <g className="ha-spin-40">
      {at.map((p, i) => { const q = at[(i + 1) % 8]; return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(244,234,138,.55)" strokeWidth="3" strokeLinecap="round" className="ha-draw" style={d(.4 + i * .08)} />; })}
      {at.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="15" fill="url(#ha-atom)" className="ha-pop ha-breathe" style={d(.3 + i * .08)} />)}
    </g>
    <text x="160" y="170" textAnchor="middle" className="ha-label">S₈</text>
  </>);
}

/* Inventory — stockpiles with a conveyor dropping prills */
function Piles() {
  return (<>
    <path d="M20 250 Q 90 130 160 250 Z" fill="url(#ha-gold)" opacity=".9" className="ha-rise" style={d(.2)} />
    <path d="M130 250 Q 215 100 300 250 Z" fill="url(#ha-gold)" className="ha-rise" style={d(.35)} />
    <path d="M70 250 Q 120 175 175 250 Z" fill="#a8961a" opacity=".7" className="ha-rise" style={d(.5)} />
    <line x1="215" y1="60" x2="320" y2="20" stroke={W} strokeWidth="6" strokeLinecap="round" />
    <line x1="215" y1="60" x2="320" y2="20" stroke={GL} strokeWidth="2" strokeDasharray="4 10" className="ha-belt" />
    {Array.from({ length: 7 }, (_, i) => <circle key={i} cx={212 + (i % 3) * 4} cy="66" r="3" fill={GL} className="ha-fall" style={d(i * .32)} />)}
    <line x1="10" y1="250" x2="310" y2="250" stroke={W} strokeWidth="2" />
    {[60, 150, 240].map((x, i) => <g key={i} className="ha-pop" style={d(.9 + i * .15)}><rect x={x - 22} y="262" width="44" height="18" rx="9" fill="rgba(255,255,255,.08)" stroke={W} /><circle cx={x - 12} cy="271" r="3" fill={i === 1 ? B : G} className="ha-blink" style={d(i * .5)} /></g>)}
  </>);
}

/* Logistics — truck on a road, ship on the horizon */
function Freight() {
  return (<>
    <path d="M0 150 Q 80 140 160 150 T 320 150" fill="none" stroke="rgba(171,169,242,.3)" strokeWidth="2" className="ha-wave" />
    <path d="M0 162 Q 80 152 160 162 T 320 162" fill="none" stroke="rgba(171,169,242,.18)" strokeWidth="2" className="ha-wave" style={d(-1.5)} />
    <g className="ha-sail"><path d="M200 140 L290 140 L280 152 L210 152 Z" fill="url(#ha-blue)" /><rect x="222" y="126" width="14" height="14" fill={G} /><rect x="238" y="126" width="14" height="14" fill="#5a57d8" /><rect x="254" y="126" width="14" height="14" fill={GL} /><rect x="272" y="118" width="8" height="22" fill="#d7e3f0" /></g>
    <rect x="0" y="236" width="320" height="34" fill="rgba(255,255,255,.04)" />
    <line x1="0" y1="253" x2="320" y2="253" stroke={GL} strokeWidth="2" strokeDasharray="18 16" className="ha-road" />
    <g className="ha-drive">
      <rect x="40" y="196" width="96" height="40" rx="4" fill="url(#ha-gold)" />
      <text x="88" y="221" textAnchor="middle" fontSize="11" fontWeight="700" fill="#3b2a10" letterSpacing="2">SULPHUR</text>
      <path d="M138 206 h24 l14 16 v14 h-38 z" fill="#d7e3f0" /><rect x="144" y="210" width="16" height="10" rx="1" fill="#23215e" />
      {[62, 112, 160].map((x) => <g key={x}><circle cx={x} cy="240" r="9" fill="#141c27" stroke={GL} strokeWidth="2" /><line x1={x - 5} y1="240" x2={x + 5} y2="240" stroke={GL} strokeWidth="2" className="ha-wheel" style={{ transformOrigin: `${x}px 240px` }} /></g>)}
      {[0, 1, 2].map((i) => <circle key={i} cx="30" cy="214" r="5" fill="rgba(255,255,255,.18)" className="ha-puff" style={d(i * .4)} />)}
    </g>
  </>);
}

/* Pricing — candles, rising line and a price tag */
function Market() {
  const bars = [90, 120, 105, 150, 135, 185, 170, 215];
  return (<>
    {[80, 140, 200, 260].map((y) => <line key={y} x1="20" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,.06)" />)}
    {bars.map((h, i) => <rect key={i} x={30 + i * 34} y={270 - h} width="18" height={h} rx="3" fill={i % 2 ? "url(#ha-blue)" : "url(#ha-gold)"} className="ha-grow" style={d(.2 + i * .07)} />)}
    <polyline points={bars.map((h, i) => `${39 + i * 34},${250 - h}`).join(" ")} fill="none" stroke={GL} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="ha-draw-long" style={d(.8)} />
    <circle cx={39 + 7 * 34} cy={250 - 215} r="6" fill={GL} className="ha-ping" />
    <g className="ha-float" style={d(.3)}><path d="M200 70 h70 l14 16 l-14 16 h-70 z" fill="rgba(255,255,255,.1)" stroke={GL} /><circle cx="210" cy="86" r="3" fill={GL} /><text x="244" y="91" textAnchor="middle" fontSize="13" fontWeight="700" fill={GL}>+ margin</text></g>
  </>);
}

/* Operations / yard — gears and a weighbridge scale */
function Plant() {
  const gear = (cx: number, cy: number, r: number, teeth: number, cls: string, fill: string) => (
    <g className={cls} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: teeth }, (_, i) => <rect key={i} x={cx - 5} y={cy - r - 9} width="10" height="14" rx="2" fill={fill} transform={`rotate(${(360 / teeth) * i} ${cx} ${cy})`} />)}
      <circle cx={cx} cy={cy} r={r} fill={fill} /><circle cx={cx} cy={cy} r={r * .38} fill="#182230" />
    </g>);
  return (<>
    {gear(120, 120, 52, 12, "ha-spin-10", "url(#ha-gold)")}
    {gear(207, 78, 30, 8, "ha-spin-6r", "url(#ha-blue)")}
    {gear(215, 178, 36, 9, "ha-spin-7r", "#a8961a")}
    <rect x="30" y="248" width="260" height="10" rx="3" fill="rgba(255,255,255,.12)" />
    <g className="ha-weigh"><rect x="70" y="222" width="180" height="24" rx="4" fill="rgba(255,255,255,.07)" stroke={W} /><rect x="230" y="200" width="56" height="22" rx="4" fill="#141c27" stroke={GL} /><text x="258" y="215" textAnchor="middle" fontSize="11" fontWeight="700" fill={GL} className="ha-blink">24.6 t</text></g>
  </>);
}

/* Sales / customers / suppliers — a connected network */
function Network({ hub = G }: { hub?: string }) {
  const n = [[60, 80], [250, 60], [280, 190], [70, 230], [170, 270], [40, 155], [205, 125]];
  return (<>
    {n.map(([x, y], i) => <line key={i} x1="160" y1="160" x2={x} y2={y} stroke="rgba(244,234,138,.35)" strokeWidth="1.5" className="ha-draw" style={d(.2 + i * .08)} />)}
    {n.map(([x, y], i) => <circle key={"p" + i} r="3" fill={GL} className="ha-packet" style={{ ...d(i * .45), offsetPath: `path("M160 160 L${x} ${y}")` } as React.CSSProperties} />)}
    {n.map(([x, y], i) => <g key={"n" + i} className="ha-pop" style={d(.5 + i * .08)}><circle cx={x} cy={y} r="17" fill="rgba(255,255,255,.07)" stroke={W} /><circle cx={x} cy={y} r="7" fill={i % 3 ? B : GL} /></g>)}
    <circle cx="160" cy="160" r="34" fill="url(#ha-halo)" className="ha-ping-soft" />
    <circle cx="160" cy="160" r="22" fill={hub} className="ha-pop ha-breathe" />
  </>);
}

/* Analytics / reports — donut and sparkline */
function Charts() {
  const C = 2 * Math.PI * 70;
  return (<>
    <circle cx="125" cy="140" r="70" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="22" />
    {[[.46, G, 0], [.3, "#5a57d8", .46], [.24, GL, .76]].map(([f, c, o], i) => (
      <circle key={i} cx="125" cy="140" r="70" fill="none" stroke={c as string} strokeWidth="22" strokeDasharray={`${(f as number) * C} ${C}`} transform={`rotate(${(o as number) * 360 - 90} 125 140)`} className="ha-arc" style={{ ...d(.2 + i * .25), ["--len" as string]: `${(f as number) * C}` }} />))}
    <text x="125" y="148" textAnchor="middle" className="ha-label" style={{ fontSize: 24 }}>46%</text>
    <g className="ha-float" style={d(.5)}>
      <rect x="196" y="200" width="112" height="62" rx="10" fill="rgba(255,255,255,.07)" stroke={W} />
      <polyline points="206,248 222,238 236,242 250,226 266,230 282,214 298,218" fill="none" stroke={GL} strokeWidth="2.5" strokeLinecap="round" className="ha-draw-long" style={d(1)} />
    </g>
    <g className="ha-float" style={d(1.2)}><rect x="210" y="40" width="96" height="40" rx="10" fill="rgba(255,255,255,.07)" stroke={W} /><rect x="222" y="54" width="44" height="5" rx="2" fill={B} /><rect x="222" y="64" width="64" height="5" rx="2" fill="rgba(255,255,255,.25)" /></g>
  </>);
}

/* Products — falling prills into a crystal lattice */
function Crystals() {
  const pts = Array.from({ length: 14 }, (_, i) => ({ x: 30 + ((i * 53) % 270), y: 30 + ((i * 97) % 240), r: 6 + (i % 4) * 4 }));
  return (<>
    <polygon points="160,60 230,110 230,200 160,250 90,200 90,110" fill="rgba(229,211,58,.12)" stroke={GL} strokeWidth="2" className="ha-draw-long ha-spin-40" style={{ transformOrigin: "160px 155px" }} />
    <polygon points="160,95 200,125 200,185 160,215 120,185 120,125" fill="url(#ha-gold)" className="ha-pop ha-breathe" style={d(.4)} />
    {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="url(#ha-atom)" opacity=".85" className="ha-bob" style={d(i * .27)} />)}
  </>);
}

/* Purchasing — boxes stacking */
function Crates() {
  const boxes = [[60, 210], [130, 210], [200, 210], [95, 150], [165, 150], [130, 90]];
  return (<>
    <line x1="20" y1="270" x2="300" y2="270" stroke={W} strokeWidth="2" />
    {boxes.map(([x, y], i) => <g key={i} className="ha-drop" style={d(.15 + i * .18)}>
      <rect x={x} y={y} width="62" height="58" rx="5" fill={i % 2 ? "url(#ha-blue)" : "url(#ha-gold)"} />
      <rect x={x + 24} y={y} width="14" height="58" fill="rgba(255,255,255,.18)" />
    </g>)}
    <g className="ha-float"><circle cx="270" cy="70" r="22" fill="rgba(255,255,255,.07)" stroke={GL} /><path d="M260 70 l7 7 l13 -14" fill="none" stroke={GL} strokeWidth="3" strokeLinecap="round" className="ha-draw" style={d(1.4)} /></g>
  </>);
}

/* Documents — fanned pages */
function Pages() {
  return (<>
    {[-16, -6, 4, 14].map((r, i) => <g key={i} className="ha-fan" style={{ ...d(.15 + i * .12), ["--r" as string]: `${r}deg` }}>
      <rect x="110" y="60" width="120" height="160" rx="8" fill={i === 3 ? "#f4efe4" : `rgba(255,255,255,${.06 + i * .05})`} stroke={W} />
      {i === 3 && [0, 1, 2, 3, 4].map((l) => <rect key={l} x="126" y={88 + l * 18} width={l === 0 ? 60 : 88} height="6" rx="3" fill={l === 0 ? G : "#c9cfd8"} />)}
    </g>)}
    <g className="ha-float" style={d(.8)}><circle cx="240" cy="220" r="26" fill={G} /><path d="M228 220 l8 8 l16 -16" fill="none" stroke="#182230" strokeWidth="4" strokeLinecap="round" /></g>
  </>);
}

/* Settings — shield with radar */
function Shield() {
  return (<>
    {[60, 95, 130].map((r, i) => <circle key={r} cx="160" cy="160" r={r} fill="none" stroke={W} className="ha-ping-soft" style={d(i * .6)} />)}
    <g className="ha-spin-6" style={{ transformOrigin: "160px 160px" }}><path d="M160 160 L160 30 A130 130 0 0 1 252 68 Z" fill="rgba(229,211,58,.16)" /></g>
    <path d="M160 92 l52 20 v40 c0 34 -24 56 -52 68 c-28 -12 -52 -34 -52 -68 v-40 z" fill="url(#ha-blue)" stroke={GL} strokeWidth="2" className="ha-pop" style={d(.3)} />
    <path d="M140 160 l14 14 l28 -28" fill="none" stroke={GL} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="ha-draw" style={d(.9)} />
  </>);
}

const SCENES: [string, () => ReactNode][] = [
  ["/inventory", Piles], ["/logistics", Freight], ["/pricing", Market], ["/market", Market], ["/tracking", Charts], ["/operations", Plant], ["/yard", Plant],
  ["/sales", () => <Network />], ["/customers", () => <Network hub="#5a57d8" />], ["/suppliers", () => <Network hub={GL} />],
  ["/analytics", Charts], ["/reports", Charts], ["/products", Crystals], ["/purchasing", Crates], ["/documents", Pages], ["/invoices", Pages],
  ["/settings", Shield], ["/setup", Shield], ["/notifications", Shield],
];

export function HeroArt() {
  const path = usePathname() ?? "/";
  const Scene = SCENES.find(([p]) => path.startsWith(p))?.[1] ?? Ring;
  return (
    <svg className="hero-art" viewBox="0 0 320 320" aria-hidden key={path}>
      <Defs />
      <circle cx="160" cy="160" r="150" fill="url(#ha-halo)" className="hero-halo" />
      <Scene />
    </svg>
  );
}
