import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DueDatePicker } from "../src/components/DueDatePicker";
import { monthGrid, withTime } from "../src/lib/dueDate";

describe("DueDatePicker", () => {
  it("builds six Monday-first weeks", () => {
    const days = monthGrid(new Date(2026, 9, 15));
    expect(days).toHaveLength(42);
    expect(days[0]!.getDay()).toBe(1);
    expect(days.some((d) => d.getMonth() === 9 && d.getDate() === 1)).toBe(true);
  });

  it("sets a local date and time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DueDatePicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Set due date" }));
    await user.click(screen.getByRole("button", { name: "Tomorrow" }));
    await user.click(screen.getByRole("button", { name: "09:00" }));
    await user.click(screen.getByRole("button", { name: "Set" }));

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    expect(onChange).toHaveBeenCalledWith(withTime(tomorrow, "09:00").toISOString());
    expect(screen.queryByRole("dialog", { name: "Due date" })).not.toBeInTheDocument();
  });

  it("clears the date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DueDatePicker value="2026-10-24T15:00:00.000Z" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^Due / }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
