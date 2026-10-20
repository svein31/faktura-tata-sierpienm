"use client";

import { CompanySecurity } from "@/components/security-controls";
import * as React from "react";
import {
  Users2,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  Copy,
  Check,
  Settings2,
  Building2,
  AlertCircle,
  FileText,
  CreditCard,
  Send,
  Download,
  KeyRound,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useAppStore } from "@/lib/store";
import type { CompanyMember, TeamInvitation, CompanyRole, CompanyPermissions } from "@/lib/types";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/role-permissions";

const ROLE_INFO: Record<
  CompanyRole,
  { label: string; desc: string; badgeTone: "default" | "primary" | "accent" | "success" | "warning" | "danger" | "info" | "outline" }
> = {
  admin: {label:"Administrator",desc:"Zarządzanie dokumentami, zespołem i integracjami; rola właściciela jest nadawana tylko przez właściciela.",badgeTone:"outline"},
  sales: {label:"Dział sprzedaży",desc:"Wystawianie dokumentów i praca z katalogiem; pozostałe uprawnienia nadaje administrator.",badgeTone:"outline"},
  owner: {
    label: "Właściciel",
    desc: "Pełne zarządzanie firmą, zespołem, rachunkami, KSeF, finansami, eksportami i usuwaniem.",
    badgeTone: "outline",
  },
  accountant: {
    label: "Księgowa / Biuro",
    desc: "Weryfikacja dokumentów, wpłaty, eksporty i audyt; dodatkowe uprawnienia nadaje administrator.",
    badgeTone: "outline",
  },
  employee: {
    label: "Pracownik / Sprzedawca",
    desc: "Wystawianie faktur i wysyłka KSeF; pozostałe uprawnienia nadaje administrator.",
    badgeTone: "outline",
  },
  viewer: {
    label: "Podgląd / Audytor",
    desc: "Wgląd do dokumentów, raportów i historii audytu bez uprawnień do edycji i wystawiania.",
    badgeTone: "outline",
  },
};

const PERMISSION_LABELS: Array<{ key: keyof CompanyPermissions; label: string; desc: string; icon: any }> = [
  { key: "canIssueInvoices", label: "Wystawianie faktur", desc: "Tworzenie nowych dokumentów sprzedaży", icon: FileText },
  { key: "canCreateCorrections", label: "Faktury korygujące", desc: "Wystawianie korekt pozycji i kwot", icon: FileText },
  { key: "canRecordPayments", label: "Rejestracja wpłat", desc: "Oznaczanie wpłat i rozliczeń faktur", icon: CreditCard },
  { key: "canExport", label: "Eksporty i JPK", desc: "Pobieranie plików JPK_V7, CSV i paczek księgowych", icon: Download },
  { key: "canSendKsef", label: "Wysyłka do KSeF", desc: "Przekazywanie faktur do Krajowego Systemu e-Faktur", icon: Send },
  { key: "canManageBankAccounts", label: "Rachunki bankowe", desc: "Dodawanie i modyfikacja kont IBAN/SWIFT firmy", icon: CreditCard },
  { key: "canManageIntegrations", label: "Integracje i tokeny KSeF", desc: "Zarządzanie konfiguracją połączeń firmy", icon: KeyRound },
  { key: "canManageTeam", label: "Zarządzanie zespołem", desc: "Zapraszanie i zmiana uprawnień członków", icon: KeyRound },
];

export default function TeamSettingsPage() {
  const toast = useToast();
  const { companies, company, selectedCompanyId, setSelectedCompanyId } = useAppStore();

  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || company || companies[0] || null;
  const canManage = activeCompany?.currentUserPermissions?.canManageTeam ?? (activeCompany?.currentUserRole === "owner");

  const [members, setMembers] = React.useState<CompanyMember[]>([]);
  const [invitations, setInvitations] = React.useState<TeamInvitation[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Zapraszanie
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<CompanyRole>("employee");
  const [customPermissions, setCustomPermissions] = React.useState<CompanyPermissions>({
    ...DEFAULT_ROLE_PERMISSIONS.employee,
  });
  const [showPermissionCustomizer, setShowPermissionCustomizer] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);

  const [invitationLinks,setInvitationLinks] = React.useState<Record<string,string>>({});
  React.useEffect(()=>setInvitationLinks({}),[activeCompany?.id]);
  // Skopiowany link
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  // Edycja członka
  const [editingMember, setEditingMember] = React.useState<CompanyMember | null>(null);
  const [editingRole, setEditingRole] = React.useState<CompanyRole>("employee");
  const [editingPermissions, setEditingPermissions] = React.useState<CompanyPermissions>({
    ...DEFAULT_ROLE_PERMISSIONS.employee,
  });
  const [savingMember, setSavingMember] = React.useState(false);

  // Aktualizacja domyślnych uprawnień przy zmianie roli w formularzu
  React.useEffect(() => {
    setCustomPermissions({ ...DEFAULT_ROLE_PERMISSIONS[inviteRole] });
  }, [inviteRole]);

  // Pobieranie członków i zaproszeń dla wybranej firmy
  const fetchTeamData = React.useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/team?companyId=${activeCompany.id}`);
      if (!res.ok) throw new Error("Błąd pobierania zespołu");
      const data = await res.json();
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    } catch {
      toast("error", "Błąd", "Nie udało się pobrać listy członków zespołu.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, toast]);

  React.useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Wysłanie zaproszenia
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) return;
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast("error", "Niepoprawny e-mail", "Podaj prawidłowy adres e-mail.");
      return;
    }

    try {
      setInviting(true);
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompany.id,
          email: inviteEmail.trim(),
          role: inviteRole,
          permissions: customPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd wysyłania zaproszenia");

      toast("success", "Zaproszenie utworzone", data.emailDelivery === "sent" ? `Wysłano e-mail do ${inviteEmail}.` : "E-mail nie został dostarczony. Skopiuj link zaproszenia i sprawdź konfigurację poczty.");
      if (data.invitation?.id && typeof data.inviteUrl === "string") setInvitationLinks(links=>({...links,[data.invitation.id]:data.inviteUrl}));
      setInviteEmail("");
      setShowPermissionCustomizer(false);
      fetchTeamData();
    } catch (err: any) {
      toast("error", "Nie udało się wysłać zaproszenia", err.message);
    } finally {
      setInviting(false);
    }
  };

  // Kopiowanie linku zaproszenia
  const copyInviteLink = async (id: string) => {
    const path = invitationLinks[id]; if (!path) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = origin + path;
    setCopiedToken(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(id);
      toast("success", "Skopiowano link", "Link zaproszenia został skopiowany do schowka.");
      setTimeout(() => setCopiedToken(null), 3000);
    } catch {
      toast("error", "Nie udało się skopiować linku", "Schowek jest niedostępny. Sprawdź uprawnienia przeglądarki i spróbuj ponownie.");
    }
  };

  // Anulowanie zaproszenia
  const handleCancelInvite = async (id: string) => {
    if (!confirm("Czy na pewno chcesz anulować to zaproszenie?")) return;
    try {
      const res = await fetch(`/api/team/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Błąd anulowania zaproszenia");
      }
      toast("success", "Zaproszenie anulowane", "Token został unieważniony.");
      fetchTeamData();
    } catch (err: any) {
      toast("error", "Błąd", err.message);
    }
  };

  // Zapis zmian uprawnień członka
  const handleSaveMember = async () => {
    if (!editingMember) return;
    try {
      setSavingMember(true);
      const res = await fetch(`/api/team/members/${editingMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editingRole,
          permissions: editingPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd zapisu uprawnień");

      toast("success", "Zaktualizowano uprawnienia", "Zmiany weszły w życie natychmiast.");
      setEditingMember(null);
      fetchTeamData();
    } catch (err: any) {
      toast("error", "Błąd", err.message);
    } finally {
      setSavingMember(false);
    }
  };

  // Usunięcie członka z zespołu (odebranie dostępu)
  const handleRemoveMember = async (member: CompanyMember) => {
    const isSelf = member.userId === activeCompany?.userId;
    if (member.role === "owner") {
      const confirmMsg = "Czy na pewno chcesz odebrać dostęp temu właścicielowi firmy?";
      if (!confirm(confirmMsg)) return;
    } else {
      if (!confirm(`Czy na pewno chcesz odebrać dostęp użytkownikowi ${member.user?.name || member.user?.email}?`)) return;
    }

    try {
      const res = await fetch(`/api/team/members/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Błąd odbierania dostępu");

      toast("success", "Dostęp odebrany", "Użytkownik utracił natychmiast dostęp do tej firmy.");
      fetchTeamData();
    } catch (err: any) {
      toast("error", "Nie można odebrać dostępu", err.message);
    }
  };

  const openMemberEditor = (member: CompanyMember) => {
    setEditingMember(member);
    setEditingRole(member.role);
    setEditingPermissions({
      canIssueInvoices: member.canIssueInvoices,
      canCreateCorrections: member.canCreateCorrections,
      canRecordPayments: member.canRecordPayments,
      canExport: member.canExport,
      canSendKsef: member.canSendKsef,
      canManageBankAccounts: member.canManageBankAccounts,
      canManageTeam: member.canManageTeam,
      canManageIntegrations: member.canManageIntegrations,
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      <CompanySecurity />
      <PageHeader
        title="Zespół i uprawnienia"
        description="Wielodostęp w firmie: role, granularne uprawnienia operacyjne, zaproszenia i natychmiastowe odcinanie sesji."
      />

      {/* Przełącznik aktywnej firmy */}
      {companies.length > 1 && (
        <Card className="p-4 bg-muted/30 border-border/80">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Zarządzasz zespołem firmy:</p>
                <p className="text-sm font-bold text-foreground">
                  {activeCompany?.companyName || activeCompany?.name || "Moja Firma"} · NIP: {activeCompany?.nip}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 w-full flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Label className="text-xs whitespace-nowrap">Zmień firmę:</Label>
              <Select
                value={activeCompany?.id || ""}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="h-8 w-full min-w-0 text-xs sm:min-w-[200px]"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || c.name} (NIP: {c.nip})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>
      )}

      {/* Komunikat o braku uprawnień do zarządzania zespołem */}
      {!canManage && (
        <Card className="p-4 bg-warning/10 border-warning/20 text-warning dark:text-warning flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold">Tryb tylko do odczytu</p>
            <p>
              Twoja obecna rola w tej firmie (<b>{activeCompany?.currentUserRole}</b>) nie posiada uprawnienia do
              zarządzania zespołem. Możesz przeglądać listę członków, ale modyfikacje są zastrzeżone dla Właściciela.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolumna lewa: Formularz zapraszania (tylko z uprawnieniem canManage) */}
        {canManage && (
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-5 border-border shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                <UserPlus className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Zaproś nowego członka</h2>
              </div>

              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Adres e-mail zapraszanego</Label>
                  <Input
                    type="email"
                    placeholder="ksiegowa@twojafirma.pl"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="mt-1 text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Zaproszenie zadziała zarówno dla nowego użytkownika, jak i osoby mającej już konto w FakturaProsto.
                  </p>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Domyślna rola</Label>
                  <Select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as CompanyRole)}
                    className="mt-1 text-xs"
                  >
                    <option value="accountant">Księgowa / Biuro rachunkowe</option>
                    <option value="employee">Pracownik / Sprzedawca</option>
                    <option value="viewer">Podgląd / Audytor</option>
                    <option value="owner">Współwłaściciel</option>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    {ROLE_INFO[inviteRole].desc}
                  </p>
                </div>

                {/* Przełącznik granularnych uprawnień */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPermissionCustomizer(!showPermissionCustomizer)}
                    className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>{showPermissionCustomizer ? "Ukryj szczegółowe uprawnienia" : "Dostosuj uprawnienia granularne"}</span>
                  </button>

                  {showPermissionCustomizer && (
                    <div className="mt-3 p-3 bg-muted/40 rounded-xl border border-border/80 space-y-2.5">
                      {PERMISSION_LABELS.map((p) => {
                        const Icon = p.icon;
                        const isChecked = customPermissions[p.key];
                        return (
                          <label key={p.key} className="flex items-start gap-2.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={inviteRole === "owner"}
                              onChange={(e) =>
                                setCustomPermissions({ ...customPermissions, [p.key]: e.target.checked })
                              }
                              className="mt-0.5 rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            <div>
                              <p className="font-semibold text-foreground flex items-center gap-1.5">
                                <Icon className="w-3 h-3 text-muted-foreground" />
                                {p.label}
                              </p>
                              <p className="text-[10.5px] text-muted-foreground">{p.desc}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={inviting} className="w-full text-xs font-semibold gap-2 mt-2">
                  <Send className="w-3.5 h-3.5" />
                  <span>{inviting ? "Wysyłanie..." : "Wyślij zaproszenie"}</span>
                </Button>
              </form>
            </Card>

            {/* Informacje o ochronie danych */}
            <Card className="p-4 bg-muted/20 border-border text-xs space-y-2 text-muted-foreground">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-success" />
                Natychmiastowe odcięcie dostępu
              </p>
              <p>
                Każde odebranie uprawnień lub usunięcie z zespołu powoduje natychmiastową blokadę w aktywnej sesji
                użytkownika przy następnym żądaniu do API.
              </p>
              <p className="pt-1">
                Ostatni właściciel firmy jest zabezpieczony przed przypadkowym usunięciem lub degradacją roli.
              </p>
            </Card>
          </div>
        )}

        {/* Kolumna prawa: Lista członków i zaproszeń */}
        <div className={canManage ? "lg:col-span-2 space-y-6" : "lg:col-span-3 space-y-6"}>
          {/* Aktywni członkowie */}
          <Card className="p-5 border-border shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Users2 className="w-5 h-5 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Aktywni członkowie ({members.length})
                </h2>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Ładowanie zespołu...</div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Brak zarejestrowanych członków.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {members.map((m) => {
                  const roleCfg = ROLE_INFO[m.role] || ROLE_INFO.employee;
                  const isOwner = m.role === "owner";
                  return (
                    <div key={m.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-md bg-muted text-foreground flex items-center justify-center text-xs font-medium`}
                        >
                          {(m.user?.name?.[0] || m.user?.email?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-foreground">
                              {m.user?.name || "Użytkownik bez nazwy"}
                            </p>
                            <Badge tone={roleCfg.badgeTone} className="text-[10px] px-1.5 py-0">
                              {roleCfg.label}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{m.user?.email}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>Dołączył: {new Date(m.createdAt).toLocaleDateString("pl-PL")}</span>
                            <span>·</span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              {m.canIssueInvoices && <span className="inline-flex items-center gap-1"><FileText aria-hidden="true" className="size-3" />Faktury</span>}
                              {m.canSendKsef && <span className="inline-flex items-center gap-1"><Send aria-hidden="true" className="size-3" />KSeF</span>}
                              {m.canExport && <span className="inline-flex items-center gap-1"><Download aria-hidden="true" className="size-3" />Eksport</span>}
                              {m.canRecordPayments && <span className="inline-flex items-center gap-1"><CreditCard aria-hidden="true" className="size-3" />Wpłaty</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openMemberEditor(m)}
                            className="h-8 text-xs gap-1.5"
                          >
                            <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Uprawnienia</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(m)}
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-border"
                            title="Odbierz dostęp"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Oczekujące zaproszenia */}
          {canManage && invitations.length > 0 && (
            <Card className="p-5 border-border shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                <Clock className="w-5 h-5 text-warning" />
                <h2 className="text-sm font-bold text-foreground">
                  Oczekujące zaproszenia ({invitations.length})
                </h2>
              </div>

              <div className="divide-y divide-border/60">
                {invitations.map((inv) => {
                  const roleCfg = ROLE_INFO[inv.role as CompanyRole] || ROLE_INFO.employee;
                  const isCopied = copiedToken === inv.id;
                  return (
                    <div key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 break-all text-xs font-bold text-foreground">{inv.email}</p>
                          <Badge tone={roleCfg.badgeTone} className="text-[10px] px-1.5 py-0">
                            {roleCfg.label}
                          </Badge>
                          <span className="text-[10px] text-warning dark:text-warning font-medium">Oczekuje na akceptację</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Ważne do: {new Date(inv.expiresAt).toLocaleDateString("pl-PL")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!invitationLinks[inv.id]}
                          title="Link jest dostępny po utworzeniu zaproszenia. Aby wysłać nowy, ponów zaproszenie."
                          onClick={() => copyInviteLink(inv.id)}
                          className="h-8 text-xs gap-1.5"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? "Skopiowano" : "Kopiuj link"}</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelInvite(inv.id)}
                          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Anuluj zaproszenie"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modal edycji uprawnień członka */}
      {editingMember && (
        <Dialog open onClose={() => setEditingMember(null)} title="Edycja uprawnień" description={editingMember.user?.email} dismissible={!savingMember}>
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <p className="text-sm font-medium text-foreground">Uprawnienia w firmie</p>
              </div>
              <Badge tone={ROLE_INFO[editingRole].badgeTone}>{ROLE_INFO[editingRole].label}</Badge>
            </div>

            <div>
              <Label htmlFor="team-member-role" className="text-xs font-medium">Rola w firmie</Label>
              <Select
                id="team-member-role"
                value={editingRole}
                onChange={(e) => {
                  const r = e.target.value as CompanyRole;
                  setEditingRole(r);
                  setEditingPermissions({ ...DEFAULT_ROLE_PERMISSIONS[r] });
                }}
                className="mt-1 text-xs"
              >
                <option value="accountant">Księgowa / Biuro rachunkowe</option>
                <option value="employee">Pracownik / Sprzedawca</option>
                <option value="viewer">Podgląd / Audytor</option>
                <option value="owner">Współwłaściciel</option>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold">Granularne uprawnienia operacyjne</Label>
              <div className="space-y-2.5 p-3 rounded-xl bg-muted/40 border border-border/80 max-h-60 overflow-y-auto">
                {PERMISSION_LABELS.map((p) => {
                  const Icon = p.icon;
                  const isChecked = editingPermissions[p.key];
                  return (
                    <label key={p.key} className="flex items-start gap-2.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={editingRole === "owner"}
                        onChange={(e) =>
                          setEditingPermissions({ ...editingPermissions, [p.key]: e.target.checked })
                        }
                        className="mt-0.5 rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <div>
                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                          <Icon className="w-3 h-3 text-muted-foreground" />
                          {p.label}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground">{p.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingMember(null)}
                className="text-xs"
              >
                Anuluj
              </Button>
              <Button
                size="sm"
                disabled={savingMember}
                onClick={handleSaveMember}
                className="text-xs font-semibold"
              >
                {savingMember ? "Zapisywanie..." : "Zapisz zmiany"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
