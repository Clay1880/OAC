import type { MetadataRoute } from "next";

// Colours mirror --paper and --dark in globals.css; a manifest cannot read CSS variables.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OAC canteen pre-order",
    short_name: "OAC",
    description: "Pre-order from the college canteen, pick a pickup slot, and pay at the counter.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en-IN",
    background_color: "#f9f9f9",
    theme_color: "#313131",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
