import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MLP Video Library",
    short_name: "MLP Library",
    description: "Marketplace Literacy Project educator and facilitator resource library.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#a64026",
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
