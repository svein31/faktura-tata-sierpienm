"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ChangeEvent = { target: { value: string }; currentTarget: { value: string } };
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue" | "children"> & {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent) => void;
  children: React.ReactNode;
  display?: "auto" | "dropdown" | "segmented";
};
type Option = { value: string; label: string; disabled: boolean };

function labelOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return labelOf(node.props.children);
  return "";
}

function parseOptions(children: React.ReactNode): Option[] {
  const options: Option[] = [];
  function visit(nodes: React.ReactNode, parentDisabled = false) {
    React.Children.forEach(nodes, node => {
      if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(node)) return;
      if (node.type === "option") options.push({ value: String(node.props.value ?? labelOf(node.props.children)), label: labelOf(node.props.children), disabled: parentDisabled || !!node.props.disabled });
      else if (node.type === React.Fragment || node.type === "optgroup") visit(node.props.children, parentDisabled || !!node.props.disabled);
    });
  }
  visit(children);
  return options;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select({
  id, name, value, defaultValue, onChange, children, className, disabled, required, display = "dropdown",
  autoFocus, title, style, form, ...props
}, forwardedRef) {
  const options = parseOptions(children);
  const controlled = value !== undefined;
  const firstEnabledValue = options.find(option => !option.disabled)?.value ?? "";
  const [internalValue, setInternalValue] = React.useState(String(defaultValue ?? firstEnabledValue));
  const selected = controlled ? String(value) : internalValue;
  const selectedOption = options.find(option => option.value === selected);
  const segment = display === "segmented" || (display === "auto" && options.length >= 2 && options.length <= 3 && options.every(option => option.value !== ""));
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [invalid, setInvalid] = React.useState(false);
  const [position, setPosition] = React.useState<React.CSSProperties>({});
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const menu = React.useRef<HTMLDivElement | null>(null);
  const typeAhead = React.useRef("");
  const typeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = React.useId();
  const errorId = React.useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const setRef = React.useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  const choose = (next: string, focusTrigger = true) => {
    if (!controlled) setInternalValue(next);
    setInvalid(false);
    if (next !== selected) onChange?.({ target: { value: next }, currentTarget: { value: next } });
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };

  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const move = (from: number, amount: number) => {
    if (!enabled.length) return from;
    const current = enabled.indexOf(from);
    return enabled[(current < 0 ? 0 : current + amount + enabled.length) % enabled.length];
  };

  const updatePosition = React.useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const dialogRect = trigger.current?.closest<HTMLElement>('[role="dialog"]')?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const below = Math.min(dialogRect?.bottom ?? viewportBottom, viewportBottom) - rect.bottom;
    const above = rect.top - Math.max(dialogRect?.top ?? viewportTop, viewportTop);
    const upward = below < 200 && above > below;
    const maxHeight = Math.min(300, Math.max(100, (upward ? above : below) - 12));
    const bounds = dialogRect || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    setPosition({ position: dialogRect ? "absolute" : "fixed", left: Math.max(8, Math.min(rect.left - bounds.left, bounds.right - bounds.left - rect.width - 8)), width: Math.min(rect.width, bounds.right - bounds.left - 16), maxHeight, ...(upward ? { bottom: bounds.bottom - rect.top + 5 } : { top: rect.bottom - bounds.top + 5 }) });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handlePointer = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open, updatePosition]);

  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  React.useEffect(() => {
    const parentForm = trigger.current?.form;
    if (!parentForm || controlled) return;
    const reset = () => { setInternalValue(String(defaultValue ?? firstEnabledValue)); setInvalid(false); setOpen(false); };
    parentForm.addEventListener("reset", reset);
    return () => parentForm.removeEventListener("reset", reset);
  }, [controlled, defaultValue, firstEnabledValue]);
  React.useEffect(() => () => { if (typeTimer.current) clearTimeout(typeTimer.current); }, []);
  React.useEffect(() => {
    const panel = menu.current;
    const option = panel?.querySelector<HTMLElement>(`[role="option"][data-index="${active}"]`);
    if (!open || !panel || !option) return;
    if (option.offsetTop < panel.scrollTop) panel.scrollTop = option.offsetTop;
    if (option.offsetTop + option.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = option.offsetTop + option.offsetHeight - panel.clientHeight;
  }, [active, open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const index = segment ? Number(event.currentTarget.dataset.index) : open ? active : Math.max(0, options.findIndex(option => option.value === selected));
    if (event.key === "Escape") { if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!enabled.length) return;
      const next = move(index, event.key === "ArrowDown" ? 1 : -1);
      if (segment) { trigger.current?.parentElement?.querySelectorAll<HTMLButtonElement>("[data-segment]")[next]?.focus(); choose(options[next].value, false); }
      else { setActive(next); setOpen(true); }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
      if (next === undefined) return;
      if (segment) { trigger.current?.parentElement?.querySelectorAll<HTMLButtonElement>("[data-segment]")[next]?.focus(); choose(options[next].value, false); }
      else { setActive(next); setOpen(true); }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (segment) return;
      event.preventDefault();
      if (open && options[active] && !options[active].disabled) choose(options[active].value);
      else if (!segment) { setActive(index); setOpen(true); }
      return;
    }
    if (!segment && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeAhead.current += event.key.toLocaleLowerCase();
      if (typeTimer.current) clearTimeout(typeTimer.current);
      typeTimer.current = setTimeout(() => { typeAhead.current = ""; }, 700);
      const next = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(typeAhead.current));
      if (next >= 0) { setActive(next); setOpen(true); }
    }
  };

  const ariaProps = {
    "aria-label": props["aria-label"],
    "aria-labelledby": props["aria-labelledby"],
    "aria-describedby": [props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined,
    "aria-required": required || undefined,
    "aria-invalid": invalid || props["aria-invalid"] || undefined,
  } as const;
  // A real select preserves native constraint validation before React's submit
  // handler, form data and resets. Hidden inputs cannot enforce `required`.
  // Explicit coordinates keep the clipped proxy inside its containing block.
  // Its default static position can otherwise escape a scrolling table and
  // enlarge the page despite the control being visually hidden.
  const nativeControl = <select name={name} value={selected} form={form} disabled={disabled} required={required} tabIndex={-1} aria-hidden="true" className="sr-only pointer-events-none" style={{ left: 0, top: 0 }} onChange={event => choose(event.target.value, false)} onInvalid={event => {
    event.preventDefault();
    setInvalid(true);
    trigger.current?.focus();
  }}>{children}</select>;
  const validationMessage = invalid ? <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">Wybierz opcję.</span> : null;

  if (segment) return <><div className={cn("relative inline-flex min-h-9 w-full min-w-0 items-stretch gap-0.5 rounded-lg border border-border/80 bg-card p-0.5 shadow-2xs dark:bg-[#0f172a]", className)} style={style} role="group" aria-label={props["aria-label"] || "Wybierz jedną opcję"} aria-labelledby={props["aria-labelledby"]} aria-describedby={ariaProps["aria-describedby"]}>
    {nativeControl}
    {options.map((option, index) => <button key={`${option.value}-${index}`} type="button" form={form} id={index === enabled[0] ? id : undefined} data-segment data-index={index} ref={index === enabled[0] ? setRef : undefined} disabled={disabled || option.disabled} title={option.label} aria-label={option.label} aria-pressed={selected === option.value} aria-invalid={invalid || undefined} tabIndex={index === (options.findIndex(item => item.value === selected && !item.disabled) >= 0 ? options.findIndex(item => item.value === selected && !item.disabled) : enabled[0]) ? 0 : -1} className={cn("min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-[12px] font-medium leading-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40", selected === option.value ? "bg-primary/20 text-primary ring-1 ring-primary/35" : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-slate-800")} onKeyDown={onKeyDown} onClick={() => choose(option.value, false)}>{option.label}</button>)}
  </div>{validationMessage}</>;

  return <>
    {nativeControl}
    <button type="button" id={id} ref={setRef} form={form} disabled={disabled} autoFocus={autoFocus} title={title || selectedOption?.label} style={style} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open ? optionId(active) : undefined} {...ariaProps} className={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3.5 text-left text-[13px] text-foreground shadow-2xs transition-colors duration-150 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-45", className)} onClick={() => { setActive(options.findIndex(option => option.value === selected && !option.disabled) >= 0 ? options.findIndex(option => option.value === selected && !option.disabled) : enabled[0] ?? 0); setOpen(previous => !previous); }} onKeyDown={onKeyDown}>
      <span className={cn("truncate", selected === "" && "text-muted-foreground")}>{selectedOption?.label || selected || "Wybierz opcję"}</span><ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
    </button>
    {validationMessage}
    {open && typeof document !== "undefined" && createPortal(<div ref={menu} id={listId} role="listbox" aria-label={props["aria-label"] || selectedOption?.label || "Opcje"} className="z-[10000] overflow-y-auto rounded-xl border border-primary/20 bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-black/5 motion-safe:animate-[select-enter_150ms_ease-out] overscroll-contain" style={position}>
      {options.map((option, index) => <div key={`${option.value}-${index}`} id={optionId(index)} data-index={index} role="option" aria-selected={selected === option.value} aria-disabled={option.disabled || undefined} onMouseMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => !option.disabled && choose(option.value)} className={cn("flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors", option.disabled ? "cursor-not-allowed opacity-40" : index === active ? "bg-primary/10 text-primary" : "hover:bg-muted/70", selected === option.value && "font-semibold")}><span className="min-w-0 break-words leading-relaxed" title={option.label}>{option.label}</span>{selected === option.value && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}</div>)}
    </div>, trigger.current?.closest('[role="dialog"]') || document.body)}
  </>;
});
Select.displayName = "Select";
