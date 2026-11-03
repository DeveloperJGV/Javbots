/**
 * Links that come from outside data (an API, a report) and end up as `<a href>` in the page. Only https, and only
 * on the hosts they belong to: a `javascript:` link, or a look-alike page slipped into a comment, never becomes
 * clickable. Each feature passes its own host list.
 */
export const GITHUB_HOSTS = ['github.com'] as const;

/** The URL when it is https on one of `hosts` (or a subdomain of one), else undefined. */
export function safeHttpsUrl(url: unknown, hosts: readonly string[]): string | undefined {
  if (typeof url !== 'string') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
  const host = parsed.hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? parsed.toString() : undefined;
}
