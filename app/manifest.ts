import type { MetadataRoute } from "next";

/**
 * What a phone reads when someone taps "Add to Home Screen".
 *
 * Two flavours of icon, because Android and iOS crop differently:
 *   "any"      — used as drawn; iOS rounds the corners itself.
 *   "maskable" — Android crops to the launcher's shape and only
 *                guarantees the middle 80%, so this one has padding.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Edgware Youth",
    short_name: "Edgware Youth",
    description: "Members, meetings, events and tasks for Edgware Youth.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2F5283",
    theme_color: "#2F5283",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
