import type { ImgHTMLAttributes } from "react";

/**
 * Renders an <img> that routes external `http(s)://` URLs through
 * Vercel's image optimizer at /_vercel/image. The optimizer enforces
 * the host allow-list, format/SVG safety rules, and edge caching
 * configured in vercel.json.
 *
 * Local paths, relative paths, and data: URIs render directly without
 * proxying — only external schemes are treated as untrusted.
 */
export function ProxiedImg({ src, width, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  if (!src || !/^https?:\/\//i.test(src)) {
    return <img src={src} width={width} {...rest} />;
  }
  const w = typeof width === "number" ? width : Number(width) || 1024;
  const proxied = `/_vercel/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
  return <img src={proxied} width={width} {...rest} />;
}
