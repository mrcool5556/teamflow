import { useState, type RefObject } from "react";
import type { LinkPasteTarget } from "../components/LinkPasteOffer";
import {
  applyShortLabel,
  findFirstUrlTarget,
  findUrlInRange,
  insertTextWithLinkDetection,
} from "../lib/richText";

export function useLinkPasteOffer(
  text: string,
  setText: (value: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
) {
  const [linkOffer, setLinkOffer] = useState<LinkPasteTarget | null>(null);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    if (!pasted || !/https?:\/\//.test(pasted)) return;

    e.preventDefault();
    const textarea = e.currentTarget;
    const result = insertTextWithLinkDetection(
      text,
      textarea.selectionStart,
      textarea.selectionEnd,
      pasted,
    );

    setText(result.value);
    if (result.pastedUrl) {
      setLinkOffer(result.pastedUrl);
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function keepLink() {
    setLinkOffer(null);
    textareaRef.current?.focus();
  }

  function shortenFromOffer(label: string) {
    if (!linkOffer) return;

    const result = applyShortLabel(
      text,
      linkOffer.start,
      linkOffer.end,
      linkOffer.url,
      label,
    );
    setText(result.value);
    setLinkOffer(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  function openShortenOffer() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const found = findUrlInRange(text, textarea.selectionStart, textarea.selectionEnd);
    if (found) {
      setLinkOffer({
        url: found.href,
        start: found.start,
        end: found.end,
      });
      return;
    }

    const first = findFirstUrlTarget(text);
    if (first) setLinkOffer(first);
  }

  function clearOfferOnEdit() {
    if (linkOffer) setLinkOffer(null);
  }

  function dismissOffer() {
    setLinkOffer(null);
  }

  return {
    linkOffer,
    handlePaste,
    keepLink,
    shortenFromOffer,
    openShortenOffer,
    clearOfferOnEdit,
    dismissOffer,
  };
}
