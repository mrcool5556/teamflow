import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomDockProvider } from "../src/ui/BottomDock";
import { useToasts, type Toasts } from "../src/ui/toastContext";

let api: Toasts;
function Grab() {
  api = useToasts();
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("toast queue", () => {
  it("stacks toasts, closes info toasts after 6 s and keeps errors", () => {
    vi.useFakeTimers();
    render(
      <BottomDockProvider>
        <Grab />
      </BottomDockProvider>,
    );
    act(() => {
      api.push({ message: "Downloading a.zip" });
      api.push({ tone: "error", message: "Could not download b.zip" });
    });
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getByRole("status")).toHaveTextContent("Downloading a.zip");
    expect(within(region).getByRole("alert")).toHaveTextContent("Could not download b.zip");

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText("Downloading a.zip")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("runs the action and dismisses the toast", () => {
    const retry = vi.fn();
    render(
      <BottomDockProvider>
        <Grab />
      </BottomDockProvider>,
    );
    act(() => {
      api.push({ tone: "error", message: "Failed", action: { label: "Retry", onClick: retry } });
    });
    act(() => within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }).click());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
