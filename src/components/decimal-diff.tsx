import { groupDigits } from "@/lib/format";

/** Splits a grouped number into [integer part, fractional part] with the sign kept on the integer side. */
function parts(s: string): [string, string] {
  const [i, f = ""] = groupDigits(s).split(".");
  return [i, f];
}

/**
 * Renders the current value exactly as filed and marks every character that differs from the prior value
 * at the same position relative to the decimal point. A reviewer sees which digits moved without doing math.
 */
export function DecimalDiff({ value, against }: { value: string | null; against: string | null }) {
  if (value == null) return <span className="text-faint">Not filed</span>;
  if (against == null || against === value) return <span>{groupDigits(value)}</span>;

  const [vi, vf] = parts(value);
  const [ai, af] = parts(against);
  const width = Math.max(vi.length, ai.length);
  const viPad = vi.padStart(width, " ");
  const aiPad = ai.padStart(width, " ");
  const fw = Math.max(vf.length, af.length);
  const vfPad = vf.padEnd(fw, " ");
  const afPad = af.padEnd(fw, " ");

  const mark = (chars: string, other: string, offset: number) =>
    [...chars].map((ch, idx) => {
      if (ch === " ") return null;
      const changed = ch !== other[idx];
      return (
        <span key={offset + idx} className={changed ? "rounded-[2px] bg-marker" : undefined}>
          {ch}
        </span>
      );
    });

  return (
    <span aria-label={`${groupDigits(value)}, changed from ${groupDigits(against)}`}>
      {mark(viPad, aiPad, 0)}
      {vf !== "" && (
        <>
          .{mark(vfPad, afPad, 1000)}
        </>
      )}
    </span>
  );
}
