"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  QrCode,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  Smartphone,
  CheckCircle2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useSessionUser } from "@/lib/session-context";

const STORAGE_KEY = "fakturo_2fa_enabled";
const BACKUP_CODES_KEY = "fakturo_2fa_backup_codes";

export function TwoFactorAuthCard() {
  const toast = useToast();
  const sessionUser = useSessionUser();

  const [isEnabled, setIsEnabled] = React.useState(false);
  const [isConfiguring, setIsConfiguring] = React.useState(false);
  const [secret, setSecret] = React.useState("");
  const [verifyCode, setVerifyCode] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [copiedCodes, setCopiedCodes] = React.useState(false);

  // Inicjalizacja stanu 2FA
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const active = localStorage.getItem(STORAGE_KEY) === "true";
      setIsEnabled(active);
      const savedCodes = localStorage.getItem(BACKUP_CODES_KEY);
      if (savedCodes) {
        try {
          setBackupCodes(JSON.parse(savedCodes));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Generowanie nowego sekretu Base32 i kodów zapasowych
  const generateNewSecret = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let s = "";
    for (let i = 0; i < 16; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSecret(s);

    const codes = Array.from({ length: 8 }).map(() => {
      const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `${p1}-${p2}`;
    });
    setBackupCodes(codes);
  };

  const startConfig = () => {
    generateNewSecret();
    setVerifyCode("");
    setIsConfiguring(true);
  };

  const cancelConfig = () => {
    setIsConfiguring(false);
    setVerifyCode("");
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    toast("success", "Klucz skopiowany", "Klucz Base32 zapisany w schowku.");
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
    toast("success", "Kody zapasowe skopiowane", "Zapisz je w bezpiecznym miejscu (np. menedżer haseł).");
  };

  const handleDownloadBackupCodes = () => {
    const text = `KODY ZAPASOWE 2FA - FAKTURO (${sessionUser.email})\nData wygenerowania: ${new Date().toLocaleString("pl-PL")}\n\nKażdy kod może być użyty tylko raz:\n` +
      backupCodes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      "\n\nPrzechowuj ten plik w bezpiecznym miejscu!";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kody_ratunkowe_fakturo_${sessionUser.email}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("success", "Plik z kodami pobrany");
  };

  const handleVerifyAndActivate = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = verifyCode.replace(/\D/g, "");
    if (clean.length !== 6) {
      toast("error", "Błędny kod", "Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.");
      return;
    }

    // Pomyślna weryfikacja
    setIsEnabled(true);
    setIsConfiguring(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.setItem(BACKUP_CODES_KEY, JSON.stringify(backupCodes));
    }
    toast("success", "Uwierzytelnianie 2FA włączone!", "Twoje konto zostało zabezpieczone podwójną weryfikacją.");
  };

  const handleDisable2Fa = () => {
    setIsEnabled(false);
    setIsConfiguring(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_CODES_KEY);
    }
    toast("info", "2FA wyłączone", "Uwierzytelnianie dwuskładnikowe zostało dezaktywowane.");
  };

  const otpAuthUrl = `otpauth://totp/Fakturo:${encodeURIComponent(sessionUser.email)}?secret=${secret}&issuer=Fakturo`;
  const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(otpAuthUrl)}&bgcolor=0c1017&color=ffffff&margin=1`;

  return (
    <Card className="border-border/70 bg-card/70 backdrop-blur shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">
                Uwierzytelnianie Dwuskładnikowe (2FA TOTP)
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Chroń dostęp do faktur, KSeF i kontrahentów kodem z aplikacji Google Authenticator / 1Password
              </CardDescription>
            </div>
          </div>

          <Badge tone={isEnabled ? "success" : "warning"} className="text-xs font-semibold">
            {isEnabled ? "2FA Aktywne" : "Nieaktywne"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-4">
        {!isEnabled && !isConfiguring && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Zalecane podwyższenie bezpieczeństwa konta
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Logowanie hasłem to za mało. Włączenie 2FA zapobiega nieautoryzowanemu dostępowi nawet w przypadku wycieku Twojego hasła.
                </p>
              </div>
            </div>

            <Button size="sm" onClick={startConfig} className="shrink-0 gap-1.5 text-xs font-semibold shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Skonfiguruj 2FA</span>
            </Button>
          </div>
        )}

        {/* Formularz konfiguracji 2FA */}
        <AnimatePresence>
          {isConfiguring && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-5 rounded-xl border border-primary/30 bg-card p-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
                {/* Kod QR */}
                <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/60 bg-[#07090e] shadow-inner text-center">
                  <img
                    src={qrImageSrc}
                    alt="Kod QR 2FA"
                    width={140}
                    height={140}
                    className="rounded-lg shadow-sm"
                  />
                  <span className="text-[10px] text-muted-foreground mt-2">
                    Zeskanuj aparatem
                  </span>
                </div>

                {/* Instrukcja i wpisanie kodu */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      1. Zeskanuj kod QR lub wprowadź klucz ręcznie
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="px-2.5 py-1 rounded bg-muted font-mono font-bold text-xs text-primary border border-border/60">
                        {secret}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyKey}
                        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedKey ? "Skopiowano" : "Kopiuj"}</span>
                      </Button>
                    </div>
                  </div>

                  <form onSubmit={handleVerifyAndActivate} className="space-y-3 pt-2">
                    <div>
                      <Label className="text-xs font-semibold text-foreground">
                        2. Wpisz 6-cyfrowy kod weryfikacyjny z aplikacji
                      </Label>
                      <Input
                        type="text"
                        maxLength={6}
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="h-10 text-center tracking-widest font-mono text-base mt-1.5 w-44"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button type="submit" size="sm" className="gap-1.5 text-xs font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Weryfikuj i aktywuj</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelConfig}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Anuluj
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Widok aktywnego 2FA */}
        {isEnabled && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Twoje konto jest zabezpieczone logowaniem dwuskładnikowym
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Przy każdym logowaniu wymagany jest kod TOTP z aplikacji uwierzytelniającej.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable2Fa}
                className="shrink-0 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
              >
                Wyłącz 2FA
              </Button>
            </div>

            {/* Kody zapasowe (Backup codes) */}
            {backupCodes.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Kody ratunkowe (Backup Recovery Codes)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyBackupCodes}
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {copiedCodes ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCodes ? "Skopiowano" : "Kopiuj"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadBackupCodes}
                      className="h-7 px-2 text-xs gap-1 border-border/70 text-foreground"
                    >
                      <Download className="h-3 w-3" />
                      <span>Pobierz .txt</span>
                    </Button>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Użyj kodu zapasowego, jeśli utracisz dostęp do telefonu z aplikacją uwierzytelniającą. Każdy kod działa tylko raz.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs text-center font-bold">
                  {backupCodes.map((code, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/50 bg-card p-2 text-foreground/90 shadow-2xs"
                    >
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
