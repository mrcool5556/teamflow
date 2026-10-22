import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../src/router";

/** Mount the whole app at `url` with an in-memory history the test can inspect and drive. */
export function renderApp(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const { unmount } = render(<RouterProvider router={router} />);
  const path = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { router, path, unmount };
}
