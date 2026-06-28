import type { UserProfile } from "@teamflow/core";
import { mergeUserProfile } from "@teamflow/core";
import { useEffect, useRef, type MutableRefObject } from "react";
import {
  beginAppearanceColorDrag,
  cancelScheduledCustomColorPreview,
  endAppearanceColorDrag,
  scheduleCustomColorPreview,
} from "../lib/appearanceColorPreview";

type CustomColorKey = keyof NonNullable<UserProfile["appearance"]["customColors"]>;

export function CustomColorField({
  label,
  value,
  profile,
  colorKey,
  customDraftRef,
  onCommit,
}: {
  label: string;
  value: string;
  profile: UserProfile;
  colorKey: CustomColorKey;
  customDraftRef: MutableRefObject<NonNullable<UserProfile["appearance"]["customColors"]>>;
  onCommit: (profile: UserProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onCommitRef = useRef(onCommit);
  const profileRef = useRef(profile);
  onCommitRef.current = onCommit;
  profileRef.current = profile;

  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== value) {
      input.value = value;
    }
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    function commit() {
      endAppearanceColorDrag();
      cancelScheduledCustomColorPreview();
      onCommitRef.current(
        mergeUserProfile(profileRef.current, {
          appearance: { customColors: { ...customDraftRef.current } },
        }),
      );
    }

    function handleInput() {
      const next = input!.value;
      customDraftRef.current = { ...customDraftRef.current, [colorKey]: next };
      scheduleCustomColorPreview(profileRef.current.appearance, customDraftRef.current);
    }

    function handlePointerDown() {
      beginAppearanceColorDrag();
    }

    function handlePointerUp() {
      endAppearanceColorDrag();
    }

    input.addEventListener("change", commit);
    input.addEventListener("input", handleInput);
    input.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      input.removeEventListener("change", commit);
      input.removeEventListener("input", handleInput);
      input.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      endAppearanceColorDrag();
      cancelScheduledCustomColorPreview();
    };
  }, [colorKey, customDraftRef]);

  return (
    <label className="appearance-color-field">
      {label}
      <input ref={inputRef} type="color" defaultValue={value} />
    </label>
  );
}
