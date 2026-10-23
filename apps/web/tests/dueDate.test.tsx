import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { dueState, formatDueChip } from "../src/lib/dueDate";
import { installFakeApi, makeIssue, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe("due date chip text and state", () => {
  const now = new Date(2026, 9, 23, 12, 0); // Fri 23 Oct 2026, noon

  it("reads overdue, soon, later and done", () => {
    expect(dueState(new Date(2026, 9, 22, 12), false, now)).toBe("overdue");
    expect(dueState(new Date(2026, 9, 23, 20), false, now)).toBe("soon");
    expect(dueState(new Date(2026, 9, 26, 12), false, now)).toBe("later");
    expect(dueState(new Date(2026, 9, 22, 12), true, now)).toBe("done");
  });

  it("says Today, Tomorrow, Yesterday, a weekday this week, else the date", () => {
    expect(formatDueChip(new Date(2026, 9, 23, 18), now)).toBe("Today");
    expect(formatDueChip(new Date(2026, 9, 24, 9), now)).toBe("Tomorrow");
    expect(formatDueChip(new Date(2026, 9, 22, 9), now)).toBe("Yesterday");
    expect(formatDueChip(new Date(2026, 9, 27, 9), now)).toMatch(/27/);
    expect(formatDueChip(new Date(2026, 9, 27, 9), now)).not.toMatch(/Oct/);
    expect(formatDueChip(new Date(2026, 11, 5, 9), now)).toMatch(/5/);
    expect(formatDueChip(new Date(2026, 11, 5, 9), now)).toMatch(/Dec/);
  });
});

/** ENG issue 1 overdue, 2 due soon, 3 done (past date), 4 later, 5 without a date. */
async function openBoard(role: "owner" | "viewer" = "owner") {
  const db = seedDb(role);
  const [first, second, third] = db.issues;
  first!.dueDate = at(-30 * HOUR);
  second!.dueDate = at(3 * HOUR);
  third!.dueDate = at(-48 * HOUR);
  third!.completedAt = at(-47 * HOUR);
  const eng = db.teams[0]!;
  const todo = db.statuses.find((s) => s.id === first!.statusId)!;
  db.issues.push(
    makeIssue(eng, 4, first!.rowId!, todo, { dueDate: at(5 * 24 * HOUR) }),
    makeIssue(eng, 5, first!.rowId!, todo),
  );
  installFakeApi(db);
  signIn(db);
  renderApp("/t/ENG");
  await screen.findByText("ENG issue 5");
  await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
  return db;
}

const cardOf = (title: string) => screen.getByText(title).closest(".issue-card") as HTMLElement;
const chipOf = (title: string) => cardOf(title).querySelector(".due-chip");

describe("due date on the board", () => {
  it("shows a chip per state and none without a date", async () => {
    await openBoard();
    expect(chipOf("ENG issue 1")).toHaveClass("due-chip--overdue");
    expect(chipOf("ENG issue 2")).toHaveClass("due-chip--soon");
    expect(chipOf("ENG issue 3")).toHaveClass("due-chip--done");
    expect(chipOf("ENG issue 4")).toHaveClass("due-chip--later");
    expect(chipOf("ENG issue 5")).toBeNull();
    expect(document.querySelector(".issue-timer, .issue-timer-trigger")).toBeNull();
  });

  it("edits the date from the chip without opening the issue", async () => {
    const user = userEvent.setup();
    const db = await openBoard();
    await user.click(within(cardOf("ENG issue 4")).getByRole("button", { name: /^Due / }));
    const picker = await screen.findByRole("dialog", { name: "Due date" });
    expect(screen.queryByLabelText("Issue title")).not.toBeInTheDocument();
    await user.click(within(picker).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(db.issues.find((i) => i.number === 4)!.dueDate).toBeNull());
    await waitFor(() => expect(chipOf("ENG issue 4")).toBeNull());
  });

  it("opens the drawer with an editable title above the field groups", async () => {
    const user = userEvent.setup();
    const db = await openBoard();
    await user.click(screen.getByText("ENG issue 1"));
    const title = await screen.findByLabelText("Issue title");
    expect(title).toHaveValue("ENG issue 1");
    expect(title).not.toHaveAttribute("readonly");
    const workflow = screen.getByRole("region", { name: "Workflow" });
    expect(title.compareDocumentPosition(workflow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.clear(title);
    await user.type(title, "Renamed issue");
    await user.tab();
    await waitFor(() => expect(db.issues[0]!.title).toBe("Renamed issue"));
  });

  it("puts Due next to Assignees in the drawer, with no Timer field", async () => {
    const user = userEvent.setup();
    await openBoard();
    await user.click(screen.getByText("ENG issue 1"));
    const people = await screen.findByRole("region", { name: "People & time" });
    expect(within(people).getByText("Assignees")).toBeInTheDocument();
    expect(within(people).getByText("Due")).toBeInTheDocument();
    expect(within(people).getByRole("button", { name: /^Due / })).toBeEnabled();
    expect(screen.queryByText("Timer")).not.toBeInTheDocument();
  });

  it("sets and clears the due date of a selection in one go", async () => {
    const user = userEvent.setup();
    const db = await openBoard();
    const selectBoth = async () => {
      await user.keyboard("{Control>}");
      await user.click(screen.getByText("ENG issue 4"));
      await user.click(screen.getByText("ENG issue 5"));
      await user.keyboard("{/Control}");
      return screen.getByRole("toolbar", { name: "Bulk issue actions" });
    };
    const issue = (n: number) =>
      db.issues.find((i) => i.number === n && i.teamId === db.teams[0]!.id)!;

    let bar = await selectBoth();
    expect(within(bar).queryByText(/timer/i)).not.toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Set due date" }));
    const picker = await screen.findByRole("dialog", { name: "Due date" });
    await user.click(within(picker).getByRole("button", { name: "Tomorrow" }));
    await user.click(within(picker).getByRole("button", { name: "Set" }));
    await waitFor(() => {
      expect(issue(4).dueDate).not.toBeNull();
      expect(issue(5).dueDate).toBe(issue(4).dueDate);
    });

    bar = await selectBoth();
    await user.click(within(bar).getByRole("button", { name: "Clear due date" }));
    await waitFor(() => {
      expect(issue(4).dueDate).toBeNull();
      expect(issue(5).dueDate).toBeNull();
    });
  });

  it("lets a viewer read due dates but not change them", async () => {
    const user = userEvent.setup();
    await openBoard("viewer");
    expect(chipOf("ENG issue 1")).toHaveClass("due-chip--overdue");
    expect(chipOf("ENG issue 1")!.tagName).toBe("SPAN");
    expect(within(cardOf("ENG issue 1")).queryByRole("button", { name: /^Due / })).toBeNull();

    await user.click(screen.getByText("ENG issue 1"));
    const people = await screen.findByRole("region", { name: "People & time" });
    expect(within(people).getByRole("button", { name: /^Due / })).toBeDisabled();
  });
});
