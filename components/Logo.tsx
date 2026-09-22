/**
 * The Edgware Youth wordmark, in the right variant for the theme.
 *
 * The file names describe the colour of the LETTERING, not the
 * background it sits on — which is the easy thing to get backwards:
 *
 *   logo-dark.png   black lettering  -> use on LIGHT backgrounds
 *   logo-light.png  white lettering  -> use on DARK backgrounds
 *
 * Both are trimmed tight to the artwork (824 x 484, no transparent
 * margin), so the nav can size them by height and get the lettering it
 * expects. Padding baked into the file would shrink the letters inside
 * their own box with no way to recover it from CSS.
 *
 * Both are rendered and CSS picks which is visible, rather than
 * swapping `src` in JavaScript — that would flicker on load and
 * mismatch between the server and client render.
 */
export function Logo({ height = 26 }: { height?: number } = {}) {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      aria-label="Edgware Youth"
      role="img"
    >
      {/* Black lettering — shown in light mode. */}
      <img
        className="logo-for-light"
        src="/brand/logo-dark.png"
        alt=""
        width={824}
        height={484}
        style={{ height, width: "auto" }}
      />
      {/* White lettering — shown in dark mode. */}
      <img
        className="logo-for-dark"
        src="/brand/logo-light.png"
        alt=""
        width={824}
        height={484}
        style={{ height, width: "auto" }}
      />
    </span>
  );
}
