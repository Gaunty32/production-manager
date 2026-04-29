import { useDemoMode, obscureChars, demoAmount } from "@/lib/demoMode";

interface DemoTextProps {
  children: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Renders text normally, or with alternating greyed characters in demo mode.
 * Pass `as` to render as a different element (default: span).
 */
export function DemoText({ children, className, as: Tag = "span" }: DemoTextProps) {
  const isDemoMode = useDemoMode();

  if (!isDemoMode) {
    return <Tag className={className}>{children}</Tag>;
  }

  const chars = obscureChars(children);
  return (
    <Tag className={className} aria-label={children}>
      {chars.map(({ char, greyed }, i) =>
        char === " " ? (
          " "
        ) : greyed ? (
          <span key={i} className="opacity-25 select-none">{char}</span>
        ) : (
          <span key={i}>{char}</span>
        )
      )}
    </Tag>
  );
}

/**
 * Renders a monetary amount normally, or as "£**.00" in demo mode.
 * Pass `value` as a pre-formatted string (e.g. "£1,234.56") or raw number.
 */
export function DemoAmount({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const isDemoMode = useDemoMode();
  const display = isDemoMode
    ? demoAmount()
    : typeof value === "number"
    ? `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : value;
  return <span className={className}>{display}</span>;
}
