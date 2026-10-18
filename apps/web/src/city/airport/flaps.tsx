/** Split-flap letters, as on the airport's boards: each letter flips in turn when the text changes. */
export function Flaps({ text, width, delay }: { text: string; width: number; delay: number }) {
  const chars = text.toUpperCase().padEnd(width, ' ').slice(0, width).split('');
  return (
    <span className="flaps" aria-hidden key={text}>
      {chars.map((c, i) => (
        <span key={i} className="flap" style={{ animationDelay: `${delay + i * 0.035}s` }}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </span>
  );
}
