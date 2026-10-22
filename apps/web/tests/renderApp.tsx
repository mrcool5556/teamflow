import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../src/router";

/** Mount the whole app at `url` with an in-memory history the test can inspect and drive. */
export function renderApp(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const path = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { router, path, unmount, queryClient };
}
