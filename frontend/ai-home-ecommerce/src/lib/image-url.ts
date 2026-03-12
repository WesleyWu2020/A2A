export function normalizeImageUrl(rawUrl: string): string {
  const value = (rawUrl || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);

    // Normalize Cloudflare image transform URLs:
    // /cdn-cgi/image/<options>/<real_path> -> /<real_path>
    const transformed = parsed.pathname.match(/^\/cdn-cgi\/image\/[^/]+\/(.+)$/);
    if (transformed?.[1]) {
      parsed.pathname = `/${transformed[1]}`;
    }

    // Keep a stable URL shape to avoid false differences.
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    // If URL parsing fails, keep original input (trimmed).
    return value;
  }
}

export function normalizeImageList(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    const normalized = normalizeImageUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}
