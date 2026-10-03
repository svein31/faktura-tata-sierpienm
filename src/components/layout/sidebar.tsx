"use client";
import * as React from "react";
import {lockBodyScroll} from "@/lib/overlay-scroll";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ChevronDown, Plus, Star, X, LayoutDashboard, FileText, Receipt, Users, Package, Briefcase, BookOpen, Settings} from "lucide-react";
import {Logo} from "@/components/logo";
import {ThemeToggle} from "./theme-toggle";
import {useSessionUser} from "@/lib/session-context";
import {useAppStore} from "@/lib/store";
import {useWorkspacePreference} from "@/lib/use-workspace-preference";
import {currentNavigation,navigationForCompany} from "@/lib/navigation";
import {cn} from "@/lib/utils";
const icons:Record<string,typeof FileText>={dashboard:LayoutDashboard,sales:FileText,expenses:Receipt,contacts:Users,warehouse:Package,projects:Briefcase,accounting:BookOpen,settings:Settings};
export function SidebarContent({onNavigate,navLayoutId}:{onNavigate?:()=>void;navLayoutId?:string}) {
 const pathname=usePathname(),user=useSessionUser(),company=useAppStore(s=>s.company),groups=navigationForCompany(company);
 const active=currentNavigation(pathname,groups),[expanded,setExpanded]=React.useState<string[]>(active?[active.group.id]:[]);
 React.useEffect(()=>{if(active)setExpanded(previous=>previous.includes(active.group.id)?previous:[...previous,active.group.id]);},[active?.group.id]);
 const prefs=useWorkspacePreference<string[]>("favorites"),favorites=Array.isArray(prefs.value)?prefs.value:[];
 const initials=user.name.split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
 const canIssue=company?.currentUserPermissions?.canIssueInvoices??company?.currentUserRole!=="accountant";
 return <div className="flex h-full flex-col"><div className="flex h-16 shrink-0 items-center justify-between border-b px-5"><Logo/><button onClick={onNavigate} aria-label="Zamknij menu" className="rounded-lg p-2 hover:bg-muted lg:hidden"><X size={18}/></button></div>
 {canIssue&&<div className="p-3"><Link href="/invoices/new" onClick={() => { useAppStore.getState().setDraft(null, true); onNavigate?.(); }} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"><Plus size={16}/>Wystaw fakturę</Link></div>}
 <nav aria-label="Menu główne" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">{groups.map(group=>{
 const Icon=icons[group.id],open=expanded.includes(group.id),selected=active?.group.id===group.id;
 return <div key={group.id}><button aria-expanded={open} aria-controls={(navLayoutId||"desktop")+"-"+group.id} onClick={()=>setExpanded(previous=>open?previous.filter(g=>g!==group.id):[...previous,group.id])} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold hover:bg-muted",selected?"bg-primary/10 text-primary":"text-foreground")}><Icon size={18} className="shrink-0"/><span className="min-w-0 flex-1 break-words">{group.label}</span><ChevronDown size={14} className={cn("shrink-0 transition-transform",open&&"rotate-180")}/></button>
 {open&&<div id={(navLayoutId||"desktop")+"-"+group.id} className="my-1 space-y-0.5 border-l pl-2 ml-5">{group.items.map(item=><div key={item.href} className="flex min-w-0 items-center"><Link href={item.href} onClick={onNavigate} aria-current={active?.item.href===item.href?"page":undefined} className={cn("min-w-0 flex-1 rounded-lg px-3 py-2.5 text-xs leading-5 hover:bg-muted",active?.item.href===item.href?"font-semibold text-primary":"text-muted-foreground")}>{item.label}</Link><button disabled={!prefs.ready||prefs.saving} aria-label={`${favorites.includes(item.href)?"Usuń z":"Dodaj do"} ulubionych: ${item.label}`} aria-pressed={favorites.includes(item.href)} onClick={()=>void prefs.save(favorites.includes(item.href)?favorites.filter(p=>p!==item.href):[...favorites,item.href])} className="rounded-lg p-2 hover:bg-muted"><Star size={13} className={favorites.includes(item.href)?"fill-primary text-primary":"text-muted-foreground"}/></button></div>)}</div>}</div>;})}{prefs.error&&<p role="alert" className="p-2 text-xs text-destructive">{prefs.error}</p>}</nav>
 <div className="flex shrink-0 items-center gap-2 border-t p-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-xs text-primary">{initials||"?"}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user.name}</p><p className="truncate text-[10px] text-muted-foreground">{user.email}</p></div><ThemeToggle/></div></div>;
}
export function Sidebar(){return <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-card lg:block"><SidebarContent/></aside>;}
export function MobileSidebar({open,onClose}:{open:boolean;onClose:()=>void}) {
 const ref=React.useRef<HTMLDivElement>(null);
 React.useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement,unlock=lockBodyScroll();
 const focusables=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);
 focusables()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const list=focusables(),first=list[0],last=list[list.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener("keydown",key);
 return()=>{unlock();document.removeEventListener("keydown",key);previous?.focus();};},[open,onClose]);
 if(!open)return null;
 return <div className="no-print fixed inset-0 z-50 lg:hidden"><button aria-label="Zamknij menu — tło" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={onClose}/><div ref={ref} role="dialog" aria-modal="true" aria-label="Nawigacja" className="absolute inset-y-0 left-0 w-72 max-w-[90vw] border-r bg-card shadow-2xl"><SidebarContent onNavigate={onClose} navLayoutId="mobile"/></div></div>;
}
