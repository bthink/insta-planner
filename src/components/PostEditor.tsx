"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Plus,
  Copy,
  Sparkles,
  FolderOpen,
  Check,
  Trash2,
  RotateCcw,
} from "lucide-react";
import type { Account, Media, Post, PostInput } from "@/lib/types";
import { missingParts } from "@/lib/types";
import MediaThumb from "./MediaThumb";
import { api, mutation } from "./api";

export type Draft = PostInput & {
  id?: string;
  publicationConfirmedAt?: string | null;
  exports?: Post["exports"];
};
export default function PostEditor({
  draft,
  account,
  library,
  aiAvailable,
  onClose,
  onSaved,
  notice,
}: {
  draft: Draft;
  account: Account;
  library: Media[];
  aiAvailable: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notice: (message: string, error?: boolean) => void;
}) {
  const [form, setForm] = useState(draft),
    [baseline, setBaseline] = useState(JSON.stringify(draft));
  const [busy, setBusy] = useState(false),
    [picker, setPicker] = useState(false),
    [proposal, setProposal] = useState("");
  const [hints, setHints] = useState("");
  const [aiMedia, setAiMedia] = useState<string[]>(draft.mediaIds.slice(0, 3));
  const alive = useRef(true),
    abort = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);
  const dirty = JSON.stringify(form) !== baseline;
  const close = () => {
    if (
      !busy &&
      (!dirty || confirm("Masz niezapisane zmiany. Zamknąć edytor bez zapisu?"))
    )
      onClose();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const media = form.mediaIds
    .map((id) => library.find((m) => m.id === id))
    .filter(Boolean) as Media[];
  const updateFromPost = (post: Post) => {
    const next: Draft = { ...post, mediaIds: post.media.map((m) => m.id) };
    setForm(next);
    setBaseline(JSON.stringify(next));
    return next;
  };
  const save = async (): Promise<Post> => {
    const post = await api<Post>(
      `posts${form.id ? `/${form.id}` : ""}`,
      mutation(form.id ? "PATCH" : "POST", form),
    );
    if (alive.current) updateFromPost(post);
    await onSaved();
    const error = post.exports.find((e) => e.lastError);
    notice(
      error
        ? `Post zapisany. Paczka wymaga ponowienia: ${error.lastError}`
        : "Zapisano",
      !!error,
    );
    return post;
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await save();
      onClose();
    } catch (error) {
      notice((error as Error).message, true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const action = async (name: string, body = {}, saveFirst = false) => {
    setBusy(true);
    try {
      const id = saveFirst ? (await save()).id : form.id;
      if (!id) throw new Error("Najpierw zapisz post.");
      const result = await api<Post>(
        `posts/${id}/${name}`,
        mutation("POST", body),
      );
      if (name !== "open" && alive.current) updateFromPost(result);
      await onSaved();
      notice(
        name === "open"
          ? "Otwarto folder paczki"
          : result.exports?.some((e) => e.lastError)
            ? "Post zapisany. Sprawdź błąd paczki."
            : "Zapisano",
        !!result.exports?.some((e) => e.lastError),
      );
    } catch (error) {
      notice((error as Error).message, true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setProposal("");
    try {
      const post = await save();
      abort.current = new AbortController();
      const result = await api<{ postId: string; caption: string }>(
        `posts/${post.id}/ai`,
        {
          ...mutation("POST", {
            mediaIds: aiMedia.filter((id) => form.mediaIds.includes(id)),
            hints,
            revision: post.revision,
          }),
          signal: abort.current.signal,
        },
      );
      if (alive.current && result.postId === post.id)
        setProposal(result.caption);
    } catch (error) {
      if (alive.current) notice((error as Error).message, true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const reorder = (index: number, delta: number) => {
    const ids = [...form.mediaIds];
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setForm({ ...form, mediaIds: ids });
  };
  const published = !!form.publicationConfirmedAt;
  const exportState = form.exports?.find(
    (e) => e.purpose === (published ? "manual" : "queue"),
  );
  return (
    <div className="modal-backdrop">
      <section
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        style={{ "--accent": account.accent } as React.CSSProperties}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              {account.name} · {published ? "HISTORIA" : "TWÓJ POST"}
            </span>
            <h2 id="editor-title">
              {form.id ? "Edytuj publikację" : "Miejsce na nowy pomysł"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Zamknij edytor"
          >
            <X />
          </button>
        </header>
        <form onSubmit={submit} className="editor-form">
          <fieldset disabled={busy} className="editor-body">
            <div className="editor-media-column">
              <div className="section-heading">
                <h3>
                  Media <span>{media.length}</span>
                </h3>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPicker(!picker)}
                >
                  <Plus size={16} /> Dodaj z biblioteki
                </button>
              </div>
              {!media.length && (
                <div className="editor-media-empty">
                  <MediaThumb />
                  <p>Pomysł może zacząć się od słów.</p>
                  <span>Zdjęcia lub film dodasz, gdy będą gotowe.</span>
                </div>
              )}
              <div className="editor-media-grid">
                {media.map((medium, index) => (
                  <div className="editor-media-item" key={medium.id}>
                    <MediaThumb medium={medium} />
                    <span className="position">{index + 1}</span>
                    <div className="reorder-controls">
                      <button
                        type="button"
                        disabled={index === 0 || busy}
                        onClick={() => reorder(index, -1)}
                        aria-label={`Przesuń medium ${index + 1} w lewo`}
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={index === media.length - 1 || busy}
                        onClick={() => reorder(index, 1)}
                        aria-label={`Przesuń medium ${index + 1} w prawo`}
                      >
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setForm({
                            ...form,
                            mediaIds: form.mediaIds.filter(
                              (id) => id !== medium.id,
                            ),
                          });
                          setAiMedia(aiMedia.filter((id) => id !== medium.id));
                        }}
                        aria-label={`Odepnij ${medium.originalName}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <span className="media-filename">
                      {medium.originalName}
                    </span>
                  </div>
                ))}
              </div>
              {picker && (
                <div className="media-picker">
                  <p className="help">Kliknij medium, aby dodać je do posta.</p>
                  <div className="picker-grid">
                    {library
                      .filter((m) => !form.mediaIds.includes(m.id))
                      .map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => {
                            setForm({
                              ...form,
                              mediaIds: [...form.mediaIds, m.id],
                              type:
                                m.mediaType === "video"
                                  ? "reel"
                                  : form.mediaIds.length
                                    ? "carousel"
                                    : "photo",
                            });
                            if (aiMedia.length < 3)
                              setAiMedia([...aiMedia, m.id]);
                          }}
                        >
                          <MediaThumb medium={m} />
                          <span>{m.originalName}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <p className="help">
                Kolejność tutaj jest kolejnością plików w paczce. Oryginały
                pozostają bez zmian.
              </p>
              <div className="ai-box">
                <div className="section-heading">
                  <h3>
                    <Sparkles size={16} /> Propozycja podpisu
                  </h3>
                </div>
                <p className="help">
                  Do OpenAI trafi kontekst konta, tytuł, notatka i wskazane
                  podglądy (maks. 3). Dla rolki wysyłamy miniaturę, nie film.
                </p>
                {media.length > 0 && (
                  <div className="ai-select">
                    {media.map((m, i) => (
                      <label key={m.id}>
                        <input
                          type="checkbox"
                          checked={aiMedia.includes(m.id)}
                          disabled={
                            busy ||
                            (!aiMedia.includes(m.id) && aiMedia.length >= 3)
                          }
                          onChange={(e) =>
                            setAiMedia(
                              e.target.checked
                                ? [...aiMedia, m.id]
                                : aiMedia.filter((id) => id !== m.id),
                            )
                          }
                        />{" "}
                        Media {i + 1}
                      </label>
                    ))}
                  </div>
                )}
                <label>
                  Dodatkowe wskazówki
                  <input
                    value={hints}
                    onChange={(e) => setHints(e.target.value)}
                    placeholder="np. krótki podpis, bez hashtagów"
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !aiAvailable}
                  onClick={generate}
                >
                  <Sparkles size={16} />
                  {busy ? "Pracuję..." : "Zapisz i zaproponuj podpis"}
                </button>
                {!aiAvailable && (
                  <p className="help">
                    Dodaj OPENAI_API_KEY do .env.local, aby włączyć AI.
                  </p>
                )}
                {proposal && (
                  <div className="ai-proposal">
                    <p>{proposal}</p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        setForm({ ...form, caption: proposal });
                        setProposal("");
                      }}
                    >
                      Użyj tej propozycji
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="editor-text-column">
              <label>
                Tytuł roboczy
                <input
                  maxLength={200}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="O czym będzie ten post?"
                  autoFocus
                />
              </label>
              <div className="field-row">
                <label>
                  Typ publikacji
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as PostInput["type"],
                      })
                    }
                  >
                    <option value="photo">Zdjęcie</option>
                    <option value="carousel">Karuzela zdjęć</option>
                    <option value="reel">Rolka</option>
                  </select>
                </label>
                <label>
                  Data publikacji
                  <input
                    type="date"
                    value={form.scheduledDate || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scheduledDate: e.target.value || null,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Podpis na Instagram i Facebook
                <textarea
                  className="caption-input"
                  value={form.caption}
                  onChange={(e) =>
                    setForm({ ...form, caption: e.target.value })
                  }
                  placeholder="Tu zaczyna się Twoja opowieść..."
                />
              </label>
              <div className="caption-meta">
                <span>{form.caption.length} znaków</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(form.caption);
                      notice("Podpis skopiowany");
                    } catch {
                      notice("Nie udało się skopiować podpisu.", true);
                    }
                  }}
                >
                  <Copy size={14} /> Kopiuj podpis
                </button>
              </div>
              <label>
                Notatka dla siebie
                <textarea
                  rows={3}
                  value={form.internalNotes}
                  onChange={(e) =>
                    setForm({ ...form, internalNotes: e.target.value })
                  }
                  placeholder="Co chcesz zapamiętać? Ta notatka nie trafia do paczki."
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.readiness === "ready"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      readiness: e.target.checked ? "ready" : "draft",
                    })
                  }
                />{" "}
                Gotowy do publikacji
              </label>
              <div className="post-state">
                {missingParts({ media, caption: form.caption }).map((part) => (
                  <span className="badge warning" key={part}>
                    {part}
                  </span>
                ))}
                {published && (
                  <span className="badge published">
                    <Check size={12} /> Opublikowany
                  </span>
                )}
                {exportState?.status === "current" && (
                  <span
                    className={`badge ${exportState.exportedRevision !== form.revision ? "warning" : ""}`}
                  >
                    {exportState.exportedRevision === form.revision
                      ? "Paczka aktualna"
                      : "Paczka starszej wersji"}
                  </span>
                )}
                {form.exports
                  ?.filter((e) => e.lastError)
                  .map((e) => (
                    <p className="export-error" key={e.purpose}>
                      Post zapisany. {e.lastError}
                    </p>
                  ))}
              </div>
              {form.id && (
                <div className="post-secondary-actions">
                  {exportState?.status === "current" && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || dirty}
                      onClick={() =>
                        action("open", {
                          purpose: published ? "manual" : "queue",
                        })
                      }
                    >
                      <FolderOpen size={16} /> Otwórz paczkę
                    </button>
                  )}
                  {form.exports?.some((e) => e.lastError) && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || dirty}
                      onClick={() => action("retry")}
                    >
                      <RotateCcw size={16} /> Ponów paczkę
                    </button>
                  )}
                  {published && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || dirty}
                        onClick={() => action("export")}
                      >
                        Odtwórz paczkę z historii
                      </button>
                      {exportState?.status === "current" && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || dirty}
                          onClick={() => action("remove-export")}
                        >
                          Usuń dodatkową paczkę
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || dirty}
                    onClick={() => {
                      if (
                        confirm(
                          published
                            ? "Cofnąć ręczne oznaczenie publikacji? Paczka zostanie odtworzona dla posta z datą."
                            : "Oznaczyć post jako opublikowany? Paczka z kolejki zostanie usunięta, a historia i media pozostaną.",
                        )
                      )
                        action("publish", {
                          published: !published,
                          revision: form.revision,
                        });
                    }}
                  >
                    {published ? <RotateCcw size={16} /> : <Check size={16} />}
                    {published
                      ? "Cofnij oznaczenie publikacji"
                      : "Oznacz jako opublikowany"}
                  </button>
                  {dirty && (
                    <p className="help">
                      Zapisz zmiany przed operacjami na paczce i publikacji.
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>
          <footer className="editor-footer">
            <div>
              {form.id && (
                <button
                  type="button"
                  className="danger-text"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Usunąć post i jego zarządzane paczki? Media pozostaną w bibliotece.",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await api(`posts/${form.id}`, { method: "DELETE" });
                      await onSaved();
                      notice("Post usunięty");
                      onClose();
                    } catch (error) {
                      notice((error as Error).message, true);
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={16} /> Usuń post
                </button>
              )}
            </div>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={close}
                disabled={busy}
              >
                Anuluj
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Zapisuję..." : "Zapisz post"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
