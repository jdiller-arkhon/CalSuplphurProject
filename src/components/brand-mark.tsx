/** California Sulphur Company element tile: yellow square, blue serif S, "CA" above and 16 (sulphur's atomic number) below. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="California Sulphur Company" className="shrink-0 rounded-[3px] shadow-[0_2px_10px_-2px_rgba(235,219,59,.55)]">
      <rect width="40" height="40" fill="#ebdb3b" />
      <text x="20" y="8.5" textAnchor="middle" fontSize="6" fontFamily="Helvetica, Arial, sans-serif" fill="#1e1c9e">CA</text>
      <text x="20" y="30" textAnchor="middle" fontSize="25" fontWeight="700" fontFamily="'Times New Roman', Times, serif" fill="#1e1c9e">S</text>
      <text x="20" y="37.5" textAnchor="middle" fontSize="5.5" fontFamily="Helvetica, Arial, sans-serif" fill="#1e1c9e">16</text>
    </svg>
  );
}
