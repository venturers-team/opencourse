import type { MetadataRoute } from "next";
import { collect } from "../lib/content";
import { siteOrigin } from "../lib/site";

/** 발행 교재만 싣는다 (docs/12) — 수집기가 곧 발행 게이트다. */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const entries: MetadataRoute.Sitemap = [{ url: `${origin}/` }, { url: `${origin}/privacy/` }];
  for (const { slug, course } of collect().published) {
    const lastModified = new Date(course.updated_at);
    entries.push({ url: `${origin}/${slug}/`, lastModified });
    for (const c of course.chapters) {
      entries.push({ url: `${origin}/${slug}/${c.id}/`, lastModified });
    }
  }
  return entries;
}
