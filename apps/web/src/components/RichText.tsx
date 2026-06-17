import { parseRichText, type RichTextSegment } from "../lib/richText";

type RichTextProps = {
  text: string;
  onRef?: (ref: string) => void;
  className?: string;
};

function renderSegment(
  segment: RichTextSegment,
  index: number,
  onRef?: (ref: string) => void,
) {
  switch (segment.type) {
    case "ref":
      return onRef ? (
        <button
          key={`ref-${index}`}
          type="button"
          className="ref-link"
          title={`Go to ${segment.value}`}
          onClick={() => onRef(segment.value)}
        >
          {segment.value}
        </button>
      ) : (
        <span key={`ref-${index}`} className="description-ref">
          {segment.value}
        </span>
      );
    case "link":
      return (
        <a
          key={`link-${index}`}
          className="rich-text-link"
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {segment.label}
        </a>
      );
    case "url":
      return (
        <a
          key={`url-${index}`}
          className="rich-text-link"
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {segment.href}
        </a>
      );
    default:
      return <span key={`text-${index}`}>{segment.value}</span>;
  }
}

export function RichText({ text, onRef, className }: RichTextProps) {
  const segments = parseRichText(text);
  if (segments.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => renderSegment(segment, index, onRef))}
    </span>
  );
}
