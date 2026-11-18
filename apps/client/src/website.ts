/**
 * The pages of the website the app links to from the settings (WEB-03): privacy policy and terms of use, in the
 * player's language. The address is the build setting VITE_WEBSITE_URL; until the website exists (M5) it is not set
 * and the settings say the page comes later.
 */
export type WebsitePage = "privacy" | "terms";

/** The address of a page, or null without a website address. */
export function websiteUrl(base: string | undefined, page: WebsitePage, lang: string): string | null {
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${lang}/${page}/`;
}
