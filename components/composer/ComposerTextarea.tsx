"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  autoFocus?: boolean;
}

export function ComposerTextarea({ value, onChange, onSubmit, placeholder, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // grow with the text, up to the max-h in the class list
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line, and Enter while composing (IME) is left alone
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || !onSubmit) return;
    event.preventDefault();
    onSubmit();
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className="block max-h-[200px] min-h-5 w-full resize-none overflow-y-auto bg-transparent p-0 text-sm leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
    />
  );
}
