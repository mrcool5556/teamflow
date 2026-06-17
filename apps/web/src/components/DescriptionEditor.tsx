import { useEffect, useRef, useState } from "react";
import {
  parseDescription,
  wrapTextareaSelection,
  type DescriptionSegment,
} from "../lib/descriptionFormat";
import { LinkPasteOffer } from "./LinkPasteOffer";
import { useLinkPasteOffer } from "../hooks/useLinkPasteOffer";

type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onNavigateRef?: (ref: string) => void;
};

function renderSegment(
  segment: DescriptionSegment,
  index: number,
  onNavigateRef?: (ref: string) => void,
) {
  switch (segment.type) {
    case "bold":
      return (
        <strong key={index} className="description-bold">
          {segment.value}
        </strong>
      );
    case "underline":
      return (
        <span key={index} className="description-underline">
          {segment.value}
        </span>
      );
    case "highlight":
      return (
        <mark key={index} className="description-highlight">
          {segment.value}
        </mark>
      );
    case "ref":
      return onNavigateRef ? (
        <button
          key={index}
          type="button"
          className="ref-link"
          title={`Go to ${segment.value}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigateRef(segment.value);
          }}
        >
          {segment.value}
        </button>
      ) : (
        <span key={index} className="description-ref">
          {segment.value}
        </span>
      );
    case "link":
      return (
        <a
          key={index}
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
          key={index}
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
      return <span key={index}>{segment.value}</span>;
  }
}

export function DescriptionEditor({
  value,
  onChange,
  onBlur,
  onNavigateRef,
}: DescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const segments = parseDescription(value);
  const isEmpty = !value.trim();
  const {
    linkOffer,
    handlePaste,
    keepLink,
    shortenFromOffer,
    openShortenOffer,
    clearOfferOnEdit,
  } = useLinkPasteOffer(value, onChange, textareaRef);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  function enterEdit() {
    setEditing(true);
  }

  function exitEdit() {
    setEditing(false);
    onBlur?.();
  }

  function applyWrap(before: string, after: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const next = wrapTextareaSelection(textarea, before, after);
    onChange(next.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  return (
    <div className="description-editor">
      <h3 className="description-editor-heading">Description</h3>

      {editing ? (
        <>
          <div
            className="description-toolbar"
            role="toolbar"
            aria-label="Description formatting"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="description-toolbar-btn"
              title="Bold (**text**)"
              onClick={() => applyWrap("**", "**")}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="description-toolbar-btn"
              title="Underline (__text__)"
              onClick={() => applyWrap("__", "__")}
            >
              <span className="description-underline">U</span>
            </button>
            <button
              type="button"
              className="description-toolbar-btn"
              title="Highlight (==text==)"
              onClick={() => applyWrap("==", "==")}
            >
              <mark className="description-highlight">H</mark>
            </button>
            <button
              type="button"
              className="description-toolbar-btn description-toolbar-btn--link"
              disabled={!/https?:\/\//.test(value)}
              title="Choose a short display label for a URL"
              onClick={openShortenOffer}
            >
              Shorten link
            </button>
            <span className="description-toolbar-hint muted">
              Select text, then apply · pasted links are clickable · click away when done
            </span>
          </div>
          <textarea
            ref={textareaRef}
            className="issue-drawer-description"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              clearOfferOnEdit();
            }}
            onPaste={handlePaste}
            onBlur={exitEdit}
            placeholder="Add a description… Pasted links are clickable automatically."
            rows={8}
          />
          <LinkPasteOffer
            target={linkOffer}
            onKeep={keepLink}
            onShorten={shortenFromOffer}
          />
        </>
      ) : (
        <div
          className="issue-drawer-description-view description-view-trigger"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".ref-link")) return;
            enterEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              enterEdit();
            }
          }}
          aria-label={isEmpty ? "Add description" : "Edit description"}
        >
          {isEmpty ? (
            <p className="muted description-empty">Click to add a description…</p>
          ) : (
            <div className="description-rendered">
              {segments.map((segment, index) =>
                renderSegment(segment, index, onNavigateRef),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
