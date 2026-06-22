/** Public project metadata shown in the About dialog and docs. */
export const TEAMFLOW_ABOUT = {
  name: "Teamflow",
  githubUrl: "https://github.com/mrcool5556/teamflow",
  licenseName: "GNU AGPL v3",
  licenseUrl: "https://www.gnu.org/licenses/agpl-3.0.html",
  tagline: "Self-hosted team issue tracker with MCP and CLI for AI assistants.",
} as const;

/** Replace YOUR_* placeholders with your real usernames before going public. */
export const TEAMFLOW_SUPPORT_LINKS = [
  {
    label: "GitHub Sponsors",
    url: "https://github.com/sponsors/mrcool5556",
    accent: true,
  },
  {
    label: "Ko-fi",
    url: "https://ko-fi.com/YOUR_KOFI_USERNAME",
  },
  {
    label: "PayPal",
    url: "https://paypal.me/YOUR_PAYPAL_USERNAME",
  },
] as const;
