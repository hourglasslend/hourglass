import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/docs", "/risks", "/terms", "/privacy"].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly" }));
}
