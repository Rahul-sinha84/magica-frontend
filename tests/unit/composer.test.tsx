import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/components/composer/Composer";

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(<Composer value="" onChange={onChange} onSubmit={onSubmit} placeholder="Message" {...props} />);
  return { onChange, onSubmit, box: screen.getByRole("textbox"), send: screen.getByRole("button", { name: "Send message" }) };
}

describe("Composer", () => {
  it("reports what you type", async () => {
    const { onChange, box } = setup();
    await userEvent.type(box, "hi");
    expect(onChange).toHaveBeenLastCalledWith("i");
  });

  it("sends on Enter", async () => {
    const { onSubmit, box } = setup({ value: "hello" });
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("adds a new line on Shift+Enter instead of sending", async () => {
    const { onSubmit, box } = setup({ value: "hello" });
    await userEvent.type(box, "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not send while an input method is composing (Enter confirms the word)", () => {
    const { onSubmit, box } = setup({ value: "こんにちは" });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "\n\n"])("does not send the empty message %j", async (value) => {
    const { onSubmit, box, send } = setup({ value });
    await userEvent.type(box, "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(send).toBeDisabled();
  });

  it("enables the send button for real text and sends on click", async () => {
    const { onSubmit, send } = setup({ value: "hello" });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("can't send at all without a submit handler", async () => {
    const { send, box } = setup({ value: "hello", onSubmit: undefined });
    expect(send).toBeDisabled();
    await userEvent.type(box, "{Enter}");
  });

  it("focuses itself when asked to", () => {
    const { box } = setup({ autoFocus: true });
    expect(box).toHaveFocus();
  });

  it("keeps the unavailable tools visible but inert", async () => {
    const { onSubmit } = setup({ value: "hello" });
    for (const name of ["Attach files", "Connect apps", "Dictation"]) {
      await userEvent.click(screen.getByRole("button", { name }));
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
