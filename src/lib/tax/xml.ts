/**
 * Minimalny, deterministyczny builder XML dla schematów JPK.
 *
 * Schematy JPK (JPK_V7M, JPK_V7K, JPK_FA) są oparte na `xsd:sequence`, więc
 * KOLEJNOŚĆ elementów jest częścią kontraktu — plik z poprawnymi wartościami,
 * ale przestawionymi węzłami zostanie odrzucony przez bramkę Ministerstwa
 * Finansów. Dlatego dokument budujemy z jawnego drzewa węzłów, w którym
 * kolejność wynika bezpośrednio z kolejności elementów tablicy `children`.
 */

import { round2 } from "./money";

export type XmlAttrValue = string | number | null | undefined;

export interface XmlNode {
  name: string;
  attrs?: Record<string, XmlAttrValue>;
  /** Treść tekstowa węzła (wzajemnie wyłączna z `children`). */
  text?: string | number | null;
  children?: XmlChild[];
}

/** Dzieci mogą być „puste" — dzięki temu warunki zapisujemy jako `cond && node`. */
export type XmlChild = XmlNode | null | undefined | false;

/** Escapowanie znaków specjalnych XML (zgodnie z XML 1.0 § 2.4). */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Usuwa znaki sterujące niedozwolone w XML 1.0 oraz normalizuje białe znaki. */
export function sanitizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderAttrs(attrs?: Record<string, XmlAttrValue>): string {
  if (!attrs) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === "") continue;
    parts.push(` ${key}="${esc(value)}"`);
  }
  return parts.join("");
}

function isPresent(child: XmlChild): child is XmlNode {
  return Boolean(child) && typeof child === "object";
}

/** Renderuje węzeł wraz z poddrzewem, stosując wcięcia po 2 spacje. */
export function renderXml(node: XmlNode, level = 0): string {
  const pad = "  ".repeat(level);
  const attrs = renderAttrs(node.attrs);
  const children = (node.children ?? []).filter(isPresent);

  if (children.length > 0) {
    const inner = children.map((child) => renderXml(child, level + 1)).join("\n");
    return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`;
  }

  if (node.text === null || node.text === undefined || node.text === "") {
    // Element bez treści i bez dzieci — zapisujemy jako element pusty.
    return `${pad}<${node.name}${attrs}/>`;
  }

  return `${pad}<${node.name}${attrs}>${esc(node.text)}</${node.name}>`;
}

/** Składa kompletny dokument XML z deklaracją i kodowaniem UTF-8. */
export function xmlDocument(root: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderXml(root, 0)}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skróty do budowy węzłów
// ─────────────────────────────────────────────────────────────────────────────

/** Element tekstowy; zwraca `null`, gdy wartość jest pusta (element pomijany). */
export function el(
  name: string,
  value: string | number | null | undefined,
  attrs?: Record<string, XmlAttrValue>
): XmlNode | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "number" ? value : sanitizeText(value);
  if (text === "") return null;
  return { name, text, attrs };
}

/** Element wymagany — zawsze obecny, nawet z pustą treścią. */
export function required(
  name: string,
  value: string | number | null | undefined,
  attrs?: Record<string, XmlAttrValue>
): XmlNode {
  const text = typeof value === "number" ? value : sanitizeText(value);
  return { name, text, attrs };
}

/** Element-kontener. */
export function node(name: string, children: XmlChild[], attrs?: Record<string, XmlAttrValue>): XmlNode {
  return { name, attrs, children };
}

/** Znacznik logiczny o wartości „1"; pomijany, gdy `on === false`. */
export function flag(name: string, on: boolean | null | undefined): XmlNode | null {
  return on ? { name, text: "1" } : null;
}

/** Kwota z dwoma miejscami po przecinku; domyślnie pomijana, gdy równa zero. */
export function money(
  name: string,
  value: number | null | undefined,
  options?: { skipZero?: boolean }
): XmlNode | null {
  const skipZero = options?.skipZero !== false;
  const amount = round2(value ?? 0);
  if (skipZero && amount === 0) return null;
  return { name, text: amount.toFixed(2) };
}

/** Wartość całkowita (pola deklaracji JPK_V7 są w pełnych złotych). */
export function integer(
  name: string,
  value: number | null | undefined,
  options?: { skipZero?: boolean }
): XmlNode | null {
  const skipZero = options?.skipZero !== false;
  const amount = Math.round(value ?? 0);
  if (skipZero && amount === 0) return null;
  return { name, text: String(amount) };
}

/** Data i czas wytworzenia pliku w formacie `xsd:dateTime` ze strefą Z. */
export function xmlDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
