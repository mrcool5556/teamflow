import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeEvent, KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useInlineRename } from "../src/hooks/useInlineRename";
import { formatFileSize, formatTimestamp } from "../src/lib/format";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

const key = (name: string) =>
  ({ key: name, preventDefault() {}, stopPropagation() {} }) as KeyboardEvent<HTMLInputElement>;
const change = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;

describe("useInlineRename", () => {
  it("saves once when Enter is followed by the input's blur", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useInlineRename("Todo", onSave));
    act(() => result.current.start());
    act(() => result.current.inputProps.onChange(change("Backlog")));
    act(() => result.current.inputProps.onKeyDown(key("Enter")));
    act(() => result.current.inputProps.onBlur());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("Backlog");
    expect(result.current.editing).toBe(false);
  });

  it("cancels on Escape without saving, even when blur follows", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useInlineRename("Todo", onSave));
    act(() => result.current.start());
    act(() => result.current.inputProps.onChange(change("Backlog")));
    act(() => result.current.inputProps.onKeyDown(key("Escape")));
    act(() => result.current.inputProps.onBlur());
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.editing).toBe(false);
  });

  it("starts from the current label each time", () => {
    const { result, rerender } = renderHook(({ label }) => useInlineRename(label, vi.fn()), {
      initialProps: { label: "Todo" },
    });
    rerender({ label: "Ready" });
    act(() => result.current.start());
    expect(result.current.inputProps.value).toBe("Ready");
  });
});

describe("row rename on the board", () => {
  it("sends one request for Enter and none for Escape", async () => {
    const db = seedDb();
    const { calls } = installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG");
    const patches = () =>
      calls.filter((call) => call.method === "PATCH" && call.path.startsWith("/rows/"));

    await userEvent.click(await screen.findByRole("button", { name: "ENG row 1" }));
    await userEvent.type(screen.getByDisplayValue("ENG row 1"), " ignored{Escape}");
    expect(await screen.findByRole("button", { name: "ENG row 1" })).toBeInTheDocument();
    expect(patches()).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "ENG row 1" }));
    await userEvent.type(screen.getByDisplayValue("ENG row 1"), " renamed{Enter}");
    expect(await screen.findByRole("button", { name: "ENG row 1 renamed" })).toBeInTheDocument();
    await waitFor(() => expect(patches()).toHaveLength(1));
  });
});

describe("format helpers", () => {
  it("keeps each caller's size precision", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1.25 * 1024 ** 3)).toBe("1.3 GB");
    expect(formatFileSize(1.25 * 1024 ** 3, 2)).toBe("1.25 GB");
  });

  it("reads SQLite timestamps as UTC and passes unparseable values through", () => {
    expect(formatTimestamp("2026-10-01 10:00:00")).toBe(formatTimestamp("2026-10-01T10:00:00Z"));
    expect(formatTimestamp("not a date")).toBe("not a date");
  });
});
