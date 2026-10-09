/** Bcrypt authenticates only the first 72 UTF-8 bytes; reject longer new passwords rather than truncating them. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export const PASSWORD_LENGTH_MESSAGE = "Hasło musi mieć co najmniej 8 znaków i najwyżej 72 bajty UTF-8 (polskie znaki zajmują więcej niż jeden bajt).";

export function validNewPasswordLength(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_BYTES && new TextEncoder().encode(password).byteLength <= MAX_PASSWORD_BYTES;
}

/** Capture both new fragment links and previously issued query links before removing credentials from the URL. */
export function readPasswordResetLink(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1));
  return { token: fragment.get("token") || url.searchParams.get("token") || "", email: url.searchParams.get("email") || "" };
}
