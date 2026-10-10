"use client";
import { useState } from "react";
import { X, Plus, Folder, KeyRound, Download } from "lucide-react";
import type { Account } from "@/lib/types";
import { api, mutation } from "./api";

type Settings = { dataDir: string; aiAvailable: boolean; model: string };
export default function AccountSettings({
  accounts,
  settings,
  onClose,
  onSaved,
  notice,
}: {
  accounts: Account[];
  settings: Settings | null;
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
  notice: (message: string, error?: boolean) => void;
}) {
  const [selected, setSelected] = useState(accounts[0]?.id || "");
  const initial = accounts.find((a) => a.id === selected);
  const [form, setForm] = useState({
    name: initial?.name || "",
    handle: initial?.handle || "",
    accent: initial?.accent || "#b17956",
    aiContext: initial?.aiContext || "",
  });
  const [busy, setBusy] = useState(false);
  const choose = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    setSelected(id);
    setForm({
      name: account?.name || "",
      handle: account?.handle || "",
      accent: account?.accent || "#b17956",
      aiContext: account?.aiContext || "",
    });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const account = await api<Account>(
        `accounts${selected ? `/${selected}` : ""}`,
        mutation(selected ? "PATCH" : "POST", form),
      );
      await onSaved(account.id);
      notice("Konto zapisane");
      onClose();
    } catch (error) {
      notice((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const backup = async () => {
    setBusy(true);
    try {
      const result = await api<{ path: string }>("backup", { method: "POST" });
      notice(`Kopia zapasowa gotowa: ${result.path}`);
    } catch (error) {
      notice((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">TWOJA PRZESTRZEŃ</span>
            <h2 id="settings-title">Konta i ustawienia</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Zamknij ustawienia"
          >
            <X />
          </button>
        </header>
        <div className="settings-body">
          <div className="account-tabs">
            {accounts.map((account) => (
              <button
                key={account.id}
                className={selected === account.id ? "active" : ""}
                onClick={() => choose(account.id)}
              >
                <span
                  className="account-dot"
                  style={{ background: account.accent }}
                />
                {account.name}
              </button>
            ))}
            <button
              onClick={() => choose("")}
              className={!selected ? "active" : ""}
            >
              <Plus size={16} /> Nowe konto
            </button>
          </div>
          <form onSubmit={save} className="account-form">
            <label>
              Nazwa konta
              <input
                required
                maxLength={120}
                value={form.name}
                placeholder="np. Dzikie kadry"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              Identyfikator konta (opcjonalnie)
              <input
                maxLength={120}
                value={form.handle}
                placeholder="np. @dzikie.kadry"
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
              />
            </label>
            <label>
              Akcent kolorystyczny
              <div className="color-input">
                <input
                  type="color"
                  value={form.accent}
                  onChange={(e) => setForm({ ...form, accent: e.target.value })}
                />
                <span>{form.accent}</span>
              </div>
            </label>
            <label>
              Kontekst do podpisów AI
              <textarea
                rows={6}
                value={form.aiContext}
                onChange={(e) =>
                  setForm({ ...form, aiContext: e.target.value })
                }
                placeholder="Tematyka, odbiorcy, ton, cel, emoji i hashtagi, zwroty do unikania. Możesz wkleić przykłady swoich podpisów."
              />
            </label>
            <p className="help">
              To lokalny profil planera. Nie wymaga logowania do Instagrama ani
              Facebooka.
            </p>
            <div className="form-actions">
              {selected && (
                <button
                  type="button"
                  className="danger-text"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Usunąć puste konto? Konta z mediami lub historią nie można usunąć.",
                      )
                    )
                      return;
                    try {
                      await api(`accounts/${selected}`, { method: "DELETE" });
                      await onSaved();
                      onClose();
                    } catch (error) {
                      notice((error as Error).message, true);
                    }
                  }}
                >
                  Usuń puste konto
                </button>
              )}
              <button className="primary" disabled={busy}>
                Zapisz konto
              </button>
            </div>
          </form>
          <div className="local-settings">
            <div>
              <Folder size={18} />
              <p>
                <strong>Folder danych</strong>
                <span>{settings?.dataDir || "Ładowanie..."}</span>
              </p>
            </div>
            <div>
              <KeyRound size={18} />
              <p>
                <strong>Podpisy przez OpenAI</strong>
                <span>
                  {settings?.aiAvailable
                    ? `Klucz skonfigurowany · ${settings.model}`
                    : "Opcjonalne. Dodaj klucz do .env.local i uruchom ponownie."}
                </span>
              </p>
            </div>
            <button
              className="secondary"
              onClick={backup}
              disabled={busy || !accounts.length}
            >
              <Download size={16} />
              {busy ? "Pracuję..." : "Utwórz kopię zapasową"}
            </button>
            <p className="help">
              Kopia zawiera bazę i media. Klucz API pozostaje poza kopią.
              Instrukcja odtworzenia jest w README.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
