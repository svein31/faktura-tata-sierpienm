"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAppStore} from "@/lib/store";
import {currentNavigation,navigationForCompany} from "@/lib/navigation";
export function WorkspaceNavigation(){const pathname=usePathname(),company=useAppStore(s=>s.company),active=currentNavigation(pathname,navigationForCompany(company));if(!active||active.group.items.length<2)return null;return <nav aria-label={`Zakładki: ${active.group.label}`} className="mb-5 flex flex-wrap gap-1 border-b pb-3">{active.group.items.map(item=><Link prefetch={false} key={item.href} href={item.href} aria-current={active.item.href===item.href?"page":undefined} className={`rounded-lg px-3 py-2 text-xs ${active.item.href===item.href?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{item.label}</Link>)}</nav>;}
