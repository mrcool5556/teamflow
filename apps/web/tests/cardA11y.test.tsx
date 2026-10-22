import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

async function openBoard() {
  const db = seedDb();
  installFakeApi(db);
  signIn(db);
  const app = renderApp("/t/ENG");
  await screen.findByText("ENG issue 1");
  return app;
}

const activators = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("[data-card-activator]"));
const cardOf = (el: HTMLElement) => el.closest(".issue-card")!;

describe("card accessibility", () => {
  it("never nests buttons inside a role=button element", async () => {
    await openBoard();
    for (const card of document.querySelectorAll(".issue-card")) {
      expect(card).not.toHaveAttribute("role");
      expect(card).not.toHaveAttribute("tabindex");
    }
    for (const el of document.querySelectorAll("[role='button']")) {
      expect(el.querySelector("button, [role='button']"), el.className).toBeNull();
    }
  });

  it("makes the title the activator: Enter opens the issue", async () => {
    const { path } = await openBoard();
    const user = userEvent.setup();
    const title = screen.getByRole("button", { name: "ENG issue 1" });
    expect(title).toHaveAttribute("data-card-activator");
    expect(title.closest("h3")).not.toBeNull();

    title.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(path()).toBe("/t/ENG/issue/ENG-1"));
  });

  it("labels every drag handle", async () => {
    await openBoard();
    const handles = document.querySelectorAll(".row-drag-handle, .column-drag-handle");
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      expect(handle.getAttribute("aria-label")).toMatch(/^Drag (row|column) /);
    }
  });

  it("toggles selection with Space and extends it with Shift+Arrow", async () => {
    await openBoard();
    const user = userEvent.setup();
    const [first, second, third] = activators();

    first!.focus();
    await user.keyboard(" ");
    expect(cardOf(first!)).toHaveClass("issue-card--selected");
    expect(first).toHaveAccessibleName(/\(selected\)/);

    await user.keyboard(" ");
    expect(cardOf(first!)).not.toHaveClass("issue-card--selected");

    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(second).toHaveFocus();
    expect(cardOf(first!)).toHaveClass("issue-card--selected");
    expect(cardOf(second!)).toHaveClass("issue-card--selected");
    expect(screen.getByRole("toolbar", { name: "Bulk issue actions" })).toBeInTheDocument();

    // A plain arrow only moves focus.
    await user.keyboard("{ArrowDown}");
    expect(third).toHaveFocus();
    expect(cardOf(third!)).not.toHaveClass("issue-card--selected");

    // Escape clears the keyboard selection like a mouse selection.
    await user.keyboard("{Escape}");
    expect(document.querySelectorAll(".issue-card--selected")).toHaveLength(0);
  });
});
