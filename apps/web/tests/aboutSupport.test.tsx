import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutDialog } from "../src/components/AboutDialog";

describe("About dialog support links", () => {
  it("shows the Ko-fi link and hides placeholder links", () => {
    render(<AboutDialog open version="test" onClose={() => {}} />);

    const kofi = screen.getByRole("link", { name: /Ko-fi/ });
    expect(kofi).toHaveAttribute("href", "https://ko-fi.com/toters");

    // PayPal still has a placeholder URL and is disabled, so it must not render.
    expect(screen.queryByRole("link", { name: /PayPal/ })).toBeNull();
  });
});
