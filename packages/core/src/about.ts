/** Public project metadata shown in the About dialog and docs. */
export const TEAMFLOW_ABOUT = {
  name: "Teamflow",
  githubUrl: "https://github.com/mrcool5556/teamflow",
  licenseName: "GNU AGPL v3",
  licenseUrl: "https://www.gnu.org/licenses/agpl-3.0.html",
  tagline: "Self-hosted team issue tracker with MCP and CLI for AI assistants.",
} as const;

export type SupportLinkConfig = {
  label: string;
  url: string;
  /** Flip to true after setting a real URL (no YOUR_* placeholders). */
  enabled: boolean;
  accent?: boolean;
  /** Optional donate QR (e.g. PayPal). Put image in apps/web/public/support/ */
  qrImageUrl?: string | null;
};

/**
 * Donation links — hidden until enabled and configured.
 *
 * PayPal: set url, enabled: true, optional qrImageUrl: "/support/paypal-qr.png"
 * Ko-fi: set url, enabled: true
 */
export const TEAMFLOW_SUPPORT = {
  paypal: {
    label: "PayPal",
    url: "https://paypal.me/YOUR_PAYPAL_USERNAME",
    enabled: false,
    accent: true,
    qrImageUrl: null,
  },
  kofi: {
    label: "Ko-fi",
    url: "https://ko-fi.com/YOUR_KOFI_USERNAME",
    enabled: false,
  },
} satisfies Record<string, SupportLinkConfig>;

function isSupportLinkVisible(link: SupportLinkConfig) {
  return link.enabled && !link.url.includes("YOUR_");
}

export function getVisibleSupportLinks(): SupportLinkConfig[] {
  return Object.values(TEAMFLOW_SUPPORT).filter(isSupportLinkVisible);
}
