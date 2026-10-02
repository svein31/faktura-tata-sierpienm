const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIES = /(?:^|;\s*)(?:auth_session|fakturaprosto_session|fakturo_session|(?:__Secure-)?next-auth\.session-token)=/;
/** Browser writes must originate at this deployment, including login and multipart uploads. */
export function isUnsafeCrossOrigin(request: Request) {
  if (SAFE.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(request.url);
      // Next may normalize the internal hostname to localhost. Host is the authority
      // received by this deployment; never accept arbitrary X-Forwarded-Host values.
      const host = request.headers.get("host") || url.host;
      const forwardedProto = request.headers.get("x-forwarded-proto");
      const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto + ":" : url.protocol;
      if (new URL(origin).origin !== new URL(protocol + "//" + host).origin || origin === "null") return true;
    }
    catch { return true; }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  return !origin && SESSION_COOKIES.test(request.headers.get("cookie") || "") &&
    request.headers.get("sec-fetch-site") !== "same-origin";
}
