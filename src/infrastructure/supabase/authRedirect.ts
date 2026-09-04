export const ROOTINE_NATIVE_AUTH_CALLBACK = "rootine://auth-callback";

/**
 * OAuth opened from a phone should hand the session to the native client when
 * it is installed. Desktop browsers keep the normal web route. The touch
 * fallback covers iPadOS Safari, which may report a desktop user agent.
 */
export function isMobileBrowser(
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints: number = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
  viewportWidth: number = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth,
) {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(userAgent);
  const touchTablet = maxTouchPoints > 1 && viewportWidth <= 1024;
  return mobileUserAgent || touchTablet;
}

export function authRedirectUrl(location?: Location) {
  const currentLocation = location ?? (typeof window === "undefined" ? undefined : window.location);
  if (!currentLocation) return ROOTINE_NATIVE_AUTH_CALLBACK;
  return isMobileBrowser()
    ? ROOTINE_NATIVE_AUTH_CALLBACK
    : new URL("/dzisiaj", currentLocation.origin).toString();
}
