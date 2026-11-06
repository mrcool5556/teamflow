import { configure, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, seedDb, signIn } from "./fakeApi";
import { renderApp } from "./renderApp";

// Whole-app renders: allow for a slow first paint when the full suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });

async function openDesign() {
  const db = seedDb();
  installFakeApi(db);
  signIn(db);
  renderApp("/t/ENG/settings/appearance/design");
  await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
  await screen.findByRole("heading", { name: "Design" });
  return db;
}

const root = () => document.documentElement;

describe("Design page", () => {
  it("opens from Appearance and goes back to it", async () => {
    const user = userEvent.setup();
    const db = seedDb();
    installFakeApi(db);
    signIn(db);
    renderApp("/t/ENG/settings/appearance");
    await waitFor(() => expect(screen.getByLabelText("Workspace")).toBeEnabled());
    await user.click(await screen.findByRole("link", { name: /Open Design page/ }));
    expect(await screen.findByRole("heading", { name: "Design" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Colours" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Appearance" }));
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
  });

  it("sets a colour theme and its light or dark side from one chip", async () => {
    const user = userEvent.setup();
    const db = await openDesign();
    const colours = screen.getByRole("radiogroup", { name: "Colours" });
    await user.click(within(colours).getByRole("radio", { name: "Machined Light" }));
    await waitFor(() =>
      expect(root().dataset).toMatchObject({ palette: "machined", theme: "light" }),
    );
    await waitFor(() =>
      expect(db.profile.appearance).toMatchObject({ colorTheme: "machined", theme: "light" }),
    );

    // A one-mode theme keeps its mode and says so; the light/dark chips are off.
    await user.click(within(colours).getByRole("radio", { name: "Cozy" }));
    await waitFor(() => expect(root().dataset.palette).toBe("cozy"));
    expect(screen.getByText(/Cozy has only a light side/)).toBeInTheDocument();
    const mode = screen.getByRole("radiogroup", { name: "Light or dark" });
    expect(within(mode).getByRole("radio", { name: "Dark" })).toBeDisabled();
  });

  it("changes every aspect and shows lip metal only for lipped buttons", async () => {
    const user = userEvent.setup();
    const db = await openDesign();
    const pick = async (group: string, option: string) =>
      user.click(
        within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
          name: option,
        }),
      );

    expect(
      within(screen.getByRole("radiogroup", { name: "Lip metal" })).getByRole("radio", {
        name: "Silver",
      }),
    ).toBeDisabled();

    await pick("Fonts", "Paper");
    await pick("Corners", "Pill");
    await pick("Windows and cards", "Glass");
    await pick("Buttons", "Lipped");
    await pick("Lip metal", "Silver");
    await pick("Text fields", "Notebook");
    await pick("Switches", "Paper flap");

    await waitFor(() =>
      expect(root().dataset).toMatchObject({
        font: "paper",
        shape: "pill",
        surface: "glass",
        buttons: "lipped",
        lip: "silver",
        inputs: "notebook",
        toggles: "flap",
      }),
    );
    await waitFor(() =>
      expect(db.profile.appearance).toMatchObject({
        fontSet: "paper",
        surface: "glass",
        buttons: "lipped",
        lip: "silver",
      }),
    );
  });

  it("switches the preview between the board, an open drawer and settings", async () => {
    const user = userEvent.setup();
    await openDesign();
    const views = screen.getByRole("radiogroup", { name: "Preview view" });
    const preview = () => document.querySelector(".design-preview-app")!;
    expect(preview()).toHaveClass("design-preview-app--board");
    await user.click(within(views).getByRole("radio", { name: "Drawer open" }));
    expect(preview()).toHaveClass("design-preview-app--drawer");
    expect(preview().querySelector(".drawer")).not.toBeNull();
    await user.click(within(views).getByRole("radio", { name: "Settings" }));
    expect(preview().querySelector(".appearance-group")).not.toBeNull();
  });

  it("holds the base UI style and the exact team colours switch", async () => {
    const user = userEvent.setup();
    await openDesign();
    const styles = screen.getByRole("radiogroup", { name: "Base UI style" });
    expect(within(styles).getAllByRole("radio")).toHaveLength(8);
    await user.click(within(styles).getByRole("radio", { name: "Glass" }));
    await waitFor(() => expect(root().dataset.chromeStyle).toBe("glass"));

    const exact = screen.getByRole("switch", { name: /Keep exact team colours/ });
    expect(exact).not.toBeChecked();
    await user.click(exact);
    await waitFor(() => expect(root().dataset.semanticContrast).toBe("preserve"));
  });
});
