import * as React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { Input } from "../../src/components/ui/input";
import { Select } from "../../src/components/ui/select";
import { Tabs } from "../../src/components/ui/tabs";
import { Tooltip } from "../../src/components/ui/tooltip";
import { Dialog } from "../../src/components/ui/dialog";
import { PageGuide } from "../../src/components/ui/page-guide";
import { CommandPalette } from "../../src/components/layout/command-palette";
import { NotificationBell } from "../../src/components/notifications/notification-center";
import { ToastProvider } from "../../src/components/toast";

function Fixture() {
  const [tab, setTab] = React.useState("first");
  const [submits, setSubmits] = React.useState(0);
  const [select, setSelect] = React.useState("");
  const [dialog, setDialog] = React.useState(false);
  const [nested, setNested] = React.useState(false);
  const [empty, setEmpty] = React.useState(false);
  const [actions, setActions] = React.useState(0);
  const [command, setCommand] = React.useState(false);
  (window as unknown as { closeEmpty: () => void }).closeEmpty = () => setEmpty(false);
  return <main className="mx-auto max-w-2xl space-y-6 p-8">
    <h1>Wyłącznie syntetyczne testy komponentów UI</h1>
    <PageGuide title="Testowy przewodnik" storageKey="ui-qa-fixture" steps={[{ title: "Krok testowy", description: "Syntetyczny opis" }]} />
    <Button id="open-command" type="button" onClick={() => setCommand(true)}>Otwórz wyszukiwanie</Button>
    <CommandPalette open={command} onOpenChange={setCommand} />
    <NotificationBell />
    <form id="tabs-form" onSubmit={event => { event.preventDefault(); setSubmits(n => n + 1); }}>
      <Tabs ariaLabel="Test zakładek" value={tab} onChange={setTab} items={[{ value: "first", label: "Pierwsza" }, { value: "second", label: "Druga" }, { value: "third", label: "Trzecia" }]} />
      <output id="tab-value">{tab}</output>
    </form>
    <form id="select-form" onSubmit={event => { event.preventDefault(); setSubmits(n => n + 1); }}>
      <label htmlFor="required-select">Wymagany wybór</label>
      <Select id="required-select" required name="choice" value={select} onChange={event => setSelect(event.target.value)}>
        <option value="">Wybierz opcję</option><option value="blocked" disabled>Zablokowana</option><option value="polish">Żółć — polskie znaki</option><option value="last">Ostatnia</option>
      </Select>
      <Button id="submit-select" type="submit">Zapisz wybór</Button>
    </form>
    <form id="reset-form">
      <Select id="reset-select" aria-label="Wybór z resetem" name="resetChoice" defaultValue="one"><option value="one">Pierwsza opcja</option><option value="two">Druga opcja</option></Select>
      <Button type="reset">Resetuj wybór</Button>
    </form>
    <Select id="disabled-select" aria-label="Nieaktywny wybór" disabled><option value="disabled">Niedostępny</option></Select>
    <Select id="segments" aria-label="Segmenty" display="segmented"><option disabled value="blocked">Zablokowany segment</option><option value="one">Segment pierwszy</option><option value="two">Segment drugi</option></Select>
    <p><Tooltip content="Opis dostępny z klawiatury">?</Tooltip></p>
    <Button id="open-dialog" type="button" onClick={() => setDialog(true)}>Otwórz dialog</Button>
    <Button id="open-empty" type="button" onClick={() => setEmpty(true)}>Otwórz pusty dialog</Button>
    <Button id="disabled-button" type="button" disabled onClick={() => setActions(n => n + 1)}>Wyłączony przycisk</Button>
    <Button id="loading-button" type="button" loading onClick={() => setActions(n => n + 1)}>Ładowanie</Button>
    <output id="submits">{submits}</output><output id="actions">{actions}</output>
    <Dialog open={dialog} onClose={() => setDialog(false)} title="Dialog testowy" description="Test pętli fokusu">
      <Input aria-label="Pierwsze pole" />
      <Select aria-label="Lista w dialogu"><option value="one">Jeden</option><option value="two">Dwa</option></Select>
      <Button type="button" id="open-nested" onClick={() => setNested(true)}>Otwórz kolejny dialog</Button>
      <label htmlFor="native-select">Ostatnia natywna lista</label><select id="native-select"><option>Native one</option><option>Native two</option></select>
      <Dialog open={nested} onClose={() => setNested(false)} title="Dialog wewnętrzny"><Input aria-label="Pole wewnętrzne" /></Dialog>
    </Dialog>
    <Dialog open={empty} dismissible={false} onClose={() => setEmpty(false)} title="Dialog bez pól">Nie ma tu elementów interaktywnych.</Dialog>
  </main>;
}
createRoot(document.getElementById("root")!).render(<ToastProvider><Fixture /></ToastProvider>);
