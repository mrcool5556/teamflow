import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutDialog } from "../src/components/AboutDialog";

describe("About dialog support links", () => {
  it("shows the Buy me a coffee link and hides placeholder links", () => {
    render(<AboutDialog open version="test" onClose={() => {}} />);

    const coffee = screen.getByRole("link", { name: /Buy me a coffee/ });
    expect(coffee).toHaveAttribute("href", "https://ko-fi.com/toters");
    expect(coffee).toHaveClass("about-link-btn--coffee");

    // PayPal still has a placeholder URL and is disabled, so it must not render.
    expect(screen.queryByRole("link", { name: /PayPal/ })).toBeNull();
  });
});
