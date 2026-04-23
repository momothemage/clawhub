/* @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProxiedImg } from "./ProxiedImg";

function srcOf(html: HTMLImageElement | null) {
  return html?.getAttribute("src") ?? null;
}

describe("ProxiedImg", () => {
  it("routes external https URLs through /_vercel/image", () => {
    const { container } = render(
      <ProxiedImg src="https://raw.githubusercontent.com/foo/bar/main/logo.png" alt="Logo" />,
    );
    const img = container.querySelector("img");
    expect(srcOf(img)).toBe(
      "/_vercel/image?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffoo%2Fbar%2Fmain%2Flogo.png&w=1024&q=75",
    );
    expect(img?.getAttribute("alt")).toBe("Logo");
  });

  it("routes external http URLs through /_vercel/image", () => {
    const { container } = render(<ProxiedImg src="http://example.com/x.png" alt="" />);
    expect(srcOf(container.querySelector("img"))).toBe(
      "/_vercel/image?url=http%3A%2F%2Fexample.com%2Fx.png&w=1024&q=75",
    );
  });

  it("respects custom numeric width", () => {
    const { container } = render(
      <ProxiedImg src="https://x.com/a.png" alt="" width={640} />,
    );
    expect(srcOf(container.querySelector("img"))).toContain("&w=640&");
  });

  it("coerces string width to number for the proxy URL", () => {
    const { container } = render(
      <ProxiedImg src="https://x.com/a.png" alt="" width="200" />,
    );
    expect(srcOf(container.querySelector("img"))).toContain("&w=200&");
  });

  it("passes through local absolute paths unchanged", () => {
    const { container } = render(<ProxiedImg src="/clawd-logo.png" alt="" />);
    expect(srcOf(container.querySelector("img"))).toBe("/clawd-logo.png");
  });

  it("passes through relative paths unchanged", () => {
    const { container } = render(<ProxiedImg src="screenshot.png" alt="" />);
    expect(srcOf(container.querySelector("img"))).toBe("screenshot.png");
  });

  it("passes through data: URIs unchanged", () => {
    const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const { container } = render(<ProxiedImg src={tiny} alt="" />);
    expect(srcOf(container.querySelector("img"))).toBe(tiny);
  });

  it("renders an empty img when src is missing", () => {
    const { container } = render(<ProxiedImg alt="" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBeNull();
  });

  it("forwards arbitrary img props (alt, loading, className)", () => {
    const { container } = render(
      <ProxiedImg
        src="https://x.com/a.png"
        alt="caption"
        loading="lazy"
        className="my-class"
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("caption");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("class")).toBe("my-class");
  });
});
