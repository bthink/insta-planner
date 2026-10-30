"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { Draggable } from "@fullcalendar/interaction";
import plLocale from "@fullcalendar/core/locales/pl";
import {
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ImageIcon,
  Lightbulb,
  Upload,
  Check,
  X,
  ArrowUpRight,
  Film,
  Copy,
  Trash2,
  CircleCheck,
} from "lucide-react";
import type { Account, Media, Post } from "@/lib/types";
import { isOverdue, missingParts, todayWarsaw } from "@/lib/types";
import MediaThumb from "./MediaThumb";
import PostEditor, { type Draft } from "./PostEditor";
import AccountSettings from "./AccountSettings";
import { api, mutation } from "./api";

type SettingsInfo = { dataDir: string; aiAvailable: boolean; model: string };
type UploadResult = {
  name: string;
  state: "pending" | "uploading" | "done" | "error";
  message?: string;
};
function toDraft(post: Post): Draft {
  return { ...post, mediaIds: post.media.map((m) => m.id) };
}
export default function Planner() {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [active, setActive] = useState("");
  const [posts, setPosts] = useState<Post[]>([]),
    [media, setMedia] = useState<Media[]>([]);
  const [settings, setSettings] = useState<SettingsInfo | null>(null),
    [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<"ideas" | "library" | "history">("ideas"),
    [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<Draft | null>(null),
    [title, setTitle] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState("");
  const [clearingPool, setClearingPool] = useState(false);
  const [uploads, setUploads] = useState<UploadResult[]>([]),
    [dragging, setDragging] = useState(false);
  const activeRef = useRef(active),
    calendar = useRef<FullCalendar>(null),
    ideasPanel = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingSequence = useRef(0),
    importing = useRef(false);
  const account = accounts.find((a) => a.id === active);
  const notice = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 12000 : 7000);
  }, []);
  const refresh = useCallback(async () => {
    const accountId = activeRef.current;
    if (!accountId) return;
    const sequence = ++loadingSequence.current;
    const [newPosts, newMedia] = await Promise.all([
      api<Post[]>(`posts?accountId=${accountId}`),
      api<Media[]>(`media?accountId=${accountId}`),
    ]);
    if (
      activeRef.current === accountId &&
      sequence === loadingSequence.current
    ) {
      setPosts(newPosts);
      setMedia(newMedia);
    }
  }, []);
  const changeAccount = useCallback(
    async (id: string) => {
      activeRef.current = id;
      setActive(id);
      setPosts([]);
      setMedia([]);
      setSelected([]);
      if (!id) return;
      localStorage.setItem("instaplanner-account", id);
      setLoading(true);
      try {
        await refresh();
      } catch (error) {
        notice((error as Error).message, true);
      } finally {
        if (activeRef.current === id) setLoading(false);
      }
    },
    [refresh, notice],
  );
  const loadAccounts = useCallback(
    async (preferred?: string) => {
      const result = await api<Account[]>("accounts");
      setAccounts(result);
      const remembered =
        preferred ||
        activeRef.current ||
        localStorage.getItem("instaplanner-account");
      await changeAccount(
        result.find((a) => a.id === remembered)?.id || result[0]?.id || "",
      );
    },
    [changeAccount],
  );
  useEffect(() => {
    Promise.all([
      loadAccounts(),
      api<SettingsInfo>("settings").then(setSettings),
    ])
      .catch((error) => setFatal((error as Error).message))
      .finally(() => setLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadAccounts]);
  useEffect(() => {
    if (tab !== "ideas" || !ideasPanel.current) return;
    const draggable = new Draggable(ideasPanel.current, {
      itemSelector: ".post-tile",
      eventData: (element) => ({
        id: element.dataset.postId,
        title: element.dataset.title,
      }),
    });
    return () => draggable.destroy();
  }, [tab, posts]);
  const newDraft = (date: string | null = null, ids: string[] = []) => {
    if (!account) {
      setShowSettings(true);
      return;
    }
    const videos = ids.filter(
      (id) => media.find((m) => m.id === id)?.mediaType === "video",
    );
    if (videos.length && ids.length > 1) {
      notice(
        "Dla rolki wybierz jeden film, a dla karuzeli same zdjęcia.",
        true,
      );
      return;
    }
    setEditor({
      accountId: active,
      title: "",
      type: videos.length ? "reel" : ids.length > 1 ? "carousel" : "photo",
      caption: "",
      internalNotes: "",
      scheduledDate: date,
      readiness: "draft",
      mediaIds: ids,
    });
    setSelected([]);
  };
  const schedule = async (id: string, date: string) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    try {
      const result = await api<Post>(
        `posts/${id}/schedule`,
        mutation("POST", { date, revision: post.revision }),
      );
      await refresh();
      notice(
        result.exports.some((e) => e.lastError)
          ? "Data zapisana. Nie udało się przygotować paczki."
          : "Data zapisana · paczka zaktualizowana",
        result.exports.some((e) => !!e.lastError),
      );
    } catch (error) {
      notice((error as Error).message, true);
      await refresh();
    }
  };
  const importFiles = async (files: FileList | File[]) => {
    if (!account || importing.current || !files.length) return;
    importing.current = true;
    const accountId = account.id;
    const list = Array.from(files);
    setUploads(list.map((file) => ({ name: file.name, state: "pending" })));
    const update = (
      index: number,
      state: UploadResult["state"],
      message?: string,
    ) =>
      setUploads((previous) =>
        previous.map((item, i) =>
          i === index ? { ...item, state, message } : item,
        ),
      );
    // One file at a time bounds memory and thumbnail processing.
    for (const [index, file] of list.entries()) {
      update(index, "uploading");
      try {
        const result = await api<Media>(
          `media?accountId=${accountId}&filename=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            body: file,
            headers: { "Content-Type": "application/octet-stream" },
          },
        );
        update(index, "done", result.thumbnailError || undefined);
      } catch (error) {
        update(index, "error", (error as Error).message);
      }
    }
    importing.current = false;
    if (activeRef.current === accountId) await refresh();
    notice("Import zakończony. Wyniki znajdziesz przy nazwach plików.");
  };
  const queue = posts.filter(
      (p) => !p.scheduledDate && !p.publicationConfirmedAt,
    ),
    history = posts.filter((p) => p.publicationConfirmedAt);
  const scheduled = posts.filter(
      (p) => p.scheduledDate && !p.publicationConfirmedAt,
    ),
    overdue = scheduled.filter((p) => isOverdue(p));
  const tile = (post: Post) => (
    <button
      key={post.id}
      className={`post-tile ${post.publicationConfirmedAt ? "is-published" : ""}`}
      data-post-id={post.id}
      data-title={post.title}
      onClick={() => setEditor(toDraft(post))}
    >
      <MediaThumb medium={post.media[0]} />
      <div className="tile-content">
        <h4>{post.title}</h4>
        <p>
          {post.type === "reel"
            ? "Rolka"
            : post.type === "carousel"
              ? `${post.media.length} zdjęć · Karuzela`
              : "Zdjęcie"}
          {post.publicationConfirmedAt && " · Opublikowany"}
        </p>
        <div className="tile-tags">
          {missingParts(post)
            .slice(0, 1)
            .map((part) => (
              <span key={part}>{part}</span>
            ))}
          {post.exports.some((e) => e.lastError) && (
            <span className="error-tag">Błąd paczki</span>
          )}
          {post.readiness === "ready" && (
            <span className="ready-tag">Gotowy</span>
          )}
        </div>
      </div>
      <ArrowUpRight size={14} className="tile-open" />
    </button>
  );

  return (
    <main
      className="planner"
      style={
        { "--accent": account?.accent || "#b17956" } as React.CSSProperties
      }
    >
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <CalendarDays size={22} />
          </span>
          <span>
            insta<span className="brand-light">planner</span>
            <small>MNIEJ DECYZJI. WIĘCEJ OPOWIEŚCI.</small>
          </span>
        </a>
        <div className="topbar-right">
          {account && (
            <label className="account-select">
              <span
                className="account-dot"
                style={{ background: account.accent }}
              />
              <select
                aria-label="Aktywne konto"
                value={active}
                onChange={(e) => {
                  void changeAccount(e.target.value);
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span className="local-pill">lokalnie</span>
            </label>
          )}
          <button
            className="icon-button"
            onClick={() => setShowSettings(true)}
            aria-label="Konta i ustawienia"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      {fatal ? (
        <section className="welcome">
          <h1>Nie udało się otworzyć danych</h1>
          <p>{fatal}</p>
          <button className="primary" onClick={() => location.reload()}>
            Spróbuj ponownie
          </button>
        </section>
      ) : !account && !loading ? (
        <section className="welcome">
          <span className="eyebrow">DOBRZE MIEĆ PLAN</span>
          <h1>
            Twoje pomysły.
            <br />
            Ich własne miejsce.
          </h1>
          <p>
            Wybierz zdjęcia, zapisz opowieść i spokojnie rozplanuj publikacje.
            <br />
            Wszystko zostaje na Twoim Macu.
          </p>
          <button className="primary" onClick={() => setShowSettings(true)}>
            <Plus size={18} /> Dodaj pierwsze konto
          </button>
        </section>
      ) : (
        <>
          <div className="page-intro">
            <div>
              <span className="eyebrow">
                {account?.name || "TWOJA PRZESTRZEŃ"}
              </span>
              <h1>Dobry plan, spokojna głowa.</h1>
              <p>Przygotuj dziś to, czym podzielisz się później.</p>
            </div>
            <button
              className="primary"
              onClick={() => newDraft()}
              disabled={!account}
            >
              <Plus size={18} /> Nowy post
            </button>
          </div>
          <div className="workspace">
            <section className="calendar-panel">
              <header className="calendar-header">
                <div>
                  <span className="eyebrow">KALENDARZ PUBLIKACJI</span>
                  <h2>{title || "Twój miesiąc"}</h2>
                </div>
                <div className="month-navigation">
                  <button
                    className="text-button today-button"
                    onClick={() => calendar.current?.getApi().today()}
                  >
                    Dzisiaj
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => calendar.current?.getApi().prev()}
                    aria-label="Poprzedni miesiąc"
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => calendar.current?.getApi().next()}
                    aria-label="Następny miesiąc"
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
              </header>
              <FullCalendar
                ref={calendar}
                plugins={[dayGridPlugin, interactionPlugin]}
                locale={plLocale}
                initialView="dayGridMonth"
                initialDate={todayWarsaw()}
                firstDay={1}
                headerToolbar={false}
                height="auto"
                fixedWeekCount={false}
                editable
                droppable
                eventDurationEditable={false}
                displayEventTime={false}
                dayMaxEvents={false}
                eventOrder="start"
                timeZone="local"
                datesSet={(info) => setTitle(info.view.title)}
                dateClick={(info) => newDraft(info.dateStr)}
                events={posts
                  .filter((p) => p.scheduledDate)
                  .map((p) => ({
                    id: p.id,
                    title: p.title,
                    start: p.scheduledDate!,
                    allDay: true,
                    extendedProps: { post: p },
                    classNames: [
                      p.publicationConfirmedAt
                        ? "published-event"
                        : isOverdue(p)
                          ? "overdue-event"
                          : "planned-event",
                    ],
                  }))}
                eventClick={(info) => {
                  const post = posts.find((p) => p.id === info.event.id);
                  if (post) setEditor(toDraft(post));
                }}
                eventDrop={(info) => {
                  const date = info.event.startStr.slice(0, 10);
                  info.revert();
                  void schedule(info.event.id, date);
                }}
                eventReceive={(info) => {
                  const id = info.event.id,
                    date = info.event.startStr.slice(0, 10);
                  info.event.remove();
                  void schedule(id, date);
                }}
                eventContent={(info) => {
                  const post = info.event.extendedProps.post as
                    Post | undefined;
                  return post ? (
                    <div className="calendar-post">
                      <MediaThumb medium={post.media[0]} />
                      <div className="calendar-post-text">
                        <strong>{post.title}</strong>
                        <span>
                          {post.publicationConfirmedAt ? (
                            <>
                              <Check size={10} /> Opublikowany
                            </>
                          ) : post.exports.some((e) => e.lastError) ? (
                            "Błąd paczki"
                          ) : isOverdue(post) ? (
                            "Zaległy"
                          ) : missingParts(post).length ? (
                            missingParts(post)[0]
                          ) : post.type === "reel" ? (
                            "Rolka"
                          ) : (
                            "Zaplanowany"
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span>{info.event.title}</span>
                  );
                }}
              />
              <footer className="calendar-footer">
                <p>
                  <span className="legend-dot" />
                  {scheduled.length} zaplanowanych{" "}
                  <span className="legend-dot published-dot" />
                  {history.length} opublikowanych
                  {overdue.length > 0 && (
                    <>
                      <span className="legend-dot overdue-dot" />
                      {overdue.length} zaległych
                    </>
                  )}
                </p>
                <span>Jedna publikacja dziennie na konto</span>
              </footer>
            </section>
            <aside className="side-panel">
              <div className="panel-tabs">
                <button
                  className={tab === "ideas" ? "active" : ""}
                  onClick={() => setTab("ideas")}
                >
                  <Lightbulb size={16} /> Pomysły <span>{queue.length}</span>
                </button>
                <button
                  className={tab === "library" ? "active" : ""}
                  onClick={() => setTab("library")}
                >
                  <ImageIcon size={16} /> Media
                </button>
                <button
                  className={tab === "history" ? "active" : ""}
                  onClick={() => setTab("history")}
                  aria-label="Historia publikacji"
                >
                  <CircleCheck size={16} />
                </button>
              </div>
              {tab === "ideas" && (
                <div className="ideas-panel" ref={ideasPanel}>
                  <div className="panel-heading">
                    <h3>Jeszcze bez daty</h3>
                    <p>Przeciągnij pomysł na wybrany dzień.</p>
                  </div>
                  {queue.map(tile)}
                  {!queue.length && (
                    <div className="panel-empty">
                      <div className="empty-symbol">
                        <Lightbulb size={28} />
                      </div>
                      <h3>Zrób miejsce na pomysły</h3>
                      <p>
                        Luźna myśl, jedno zdjęcie, gotowy post.
                        <br />
                        Nie musisz od razu wybierać daty.
                      </p>
                      <button className="secondary" onClick={() => newDraft()}>
                        <Plus size={16} /> Zapisz pomysł
                      </button>
                    </div>
                  )}
                  <div className="panel-note">
                    <span>MAŁY KROK, DUŻO SPOKOJU</span>
                    <p>
                      Zaplanuj kilka publikacji naraz.
                      <br />
                      Potem wystarczy otworzyć gotową paczkę.
                    </p>
                  </div>
                </div>
              )}
              {tab === "history" && (
                <div className="ideas-panel">
                  <div className="panel-heading">
                    <h3>Opublikowane ręcznie</h3>
                    <p>Historia i media pozostają z Tobą.</p>
                  </div>
                  {history.map(tile)}
                  {!history.length && (
                    <div className="panel-empty">
                      <CircleCheck size={30} />
                      <p>
                        Historia pojawi się po ręcznym oznaczeniu publikacji.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {tab === "library" && (
                <div className="library-panel">
                  <div className="panel-heading">
                    <h3>
                      Twoje media <span>{media.length}</span>
                    </h3>
                    <p>Gotowe zdjęcia i filmy dla tego konta.</p>
                    <button
                      className="button secondary"
                      disabled={
                        !media.length ||
                        loading ||
                        clearingPool ||
                        uploads.some(
                          (u) =>
                            u.state === "pending" || u.state === "uploading",
                        )
                      }
                      onClick={async () => {
                        if (
                          !account ||
                          !confirm(
                            `Wyczyścić cały media pool konta „${account.name}” (${media.length} mediów)? Nieużywane kopie i miniatury zostaną trwale usunięte. Media przypisane do postów pozostaną w poolu.`,
                          )
                        )
                          return;
                        const accountId = account.id;
                        setClearingPool(true);
                        try {
                          const result = await api<{
                            deleted: number;
                            retained: number;
                          }>(
                            `media?accountId=${encodeURIComponent(accountId)}`,
                            { method: "DELETE" },
                          );
                          if (activeRef.current === accountId) setSelected([]);
                          await refresh();
                          notice(
                            `Czyszczenie konta „${account.name}” zakończone. Usunięto: ${result.deleted}, pominięto używane: ${result.retained}.`,
                          );
                        } catch (error) {
                          await refresh().catch(() => {});
                          notice((error as Error).message, true);
                        } finally {
                          setClearingPool(false);
                        }
                      }}
                    >
                      <Trash2 size={16} />{" "}
                      {clearingPool
                        ? "Czyszczenie..."
                        : "Wyczyść cały media pool"}
                    </button>
                  </div>
                  <button
                    className="button secondary"
                    disabled={
                      loading || clearingPool || !media.some((m) => m.published)
                    }
                    onClick={async () => {
                      if (
                        !account ||
                        !confirm(
                          `Usunąć opublikowane media z puli konta „${account.name}”? Pliki pozostaną w postach, historii i eksportach.`,
                        )
                      )
                        return;
                      const accountId = account.id;
                      setClearingPool(true);
                      try {
                        const result = await api<{ removed: number }>(
                          `media?accountId=${encodeURIComponent(accountId)}&publishedOnly=true`,
                          { method: "DELETE" },
                        );
                        if (activeRef.current === accountId) setSelected([]);
                        await refresh();
                        notice(
                          `Usunięto z puli opublikowane media: ${result.removed}.`,
                        );
                      } catch (error) {
                        notice((error as Error).message, true);
                      } finally {
                        setClearingPool(false);
                      }
                    }}
                  >
                    <Trash2 size={16} /> Usuń opublikowane z puli
                  </button>
                  <div
                    className={`dropzone ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      void importFiles(e.dataTransfer.files);
                    }}
                  >
                    <Upload size={22} />
                    <strong>Przeciągnij pliki tutaj</strong>
                    <button
                      className="text-button"
                      onClick={() => fileInput.current?.click()}
                      disabled={importing.current}
                    >
                      lub wybierz z dysku
                    </button>
                    <span>JPG, PNG, WebP, MP4, MOV · do 2 GB</span>
                    <input
                      hidden
                      ref={fileInput}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                      onChange={(e) => {
                        if (e.target.files) void importFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {uploads.length > 0 && (
                    <div className="upload-results">
                      <div className="section-heading">
                        <h4>
                          Import{" "}
                          {
                            uploads.filter(
                              (u) => u.state === "done" || u.state === "error",
                            ).length
                          }
                          /{uploads.length}
                        </h4>
                        {!importing.current && (
                          <button
                            className="icon-button"
                            onClick={() => setUploads([])}
                            aria-label="Zamknij wyniki importu"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {uploads.map((u, i) => (
                        <p
                          key={i}
                          className={u.state === "error" ? "upload-error" : ""}
                        >
                          {u.state === "done" ? (
                            <Check size={12} />
                          ) : u.state === "error" ? (
                            <X size={12} />
                          ) : (
                            <span className="progress-dot" />
                          )}
                          <span>
                            {u.name}
                            {u.message && <small>{u.message}</small>}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                  {selected.length > 0 && (
                    <div className="selection-tools">
                      <strong>{selected.length} wybranych</strong>
                      <button
                        className="primary"
                        onClick={() => newDraft(null, selected)}
                      >
                        <Plus size={14} /> Utwórz post
                      </button>
                      <select
                        aria-label="Kopiuj do innego konta"
                        value=""
                        onChange={async (e) => {
                          const target = e.target.value;
                          if (!target) return;
                          try {
                            for (const id of selected)
                              await api(
                                `media/${id}/copy`,
                                mutation("POST", { accountId: target }),
                              );
                            notice("Media skopiowane do wybranego konta");
                            setSelected([]);
                          } catch (error) {
                            notice((error as Error).message, true);
                          }
                        }}
                      >
                        <option value="">Kopiuj do konta...</option>
                        {accounts
                          .filter((a) => a.id !== active)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                      <button
                        className="text-button"
                        onClick={() => setSelected([])}
                      >
                        Odznacz
                      </button>
                    </div>
                  )}
                  <div className="library-grid">
                    {media.map((m) => (
                      <div
                        className={`library-item ${m.planned || m.published ? "is-used" : ""} ${selected.includes(m.id) ? "selected" : ""}`}
                        key={m.id}
                      >
                        <button
                          className="media-select"
                          onClick={() =>
                            setSelected(
                              selected.includes(m.id)
                                ? selected.filter((id) => id !== m.id)
                                : [...selected, m.id],
                            )
                          }
                          aria-label={`Wybierz ${m.originalName}`}
                          aria-pressed={selected.includes(m.id)}
                        >
                          <MediaThumb medium={m} />
                          <span className="selection-check">
                            {selected.includes(m.id) && <Check size={12} />}
                          </span>
                        </button>
                        <p title={m.originalName}>{m.originalName}</p>
                        <div className="media-status">
                          {m.published ? (
                            <span>
                              Opublikowane {m.published}×
                              {m.planned ? " · Zaplanowane" : ""}
                            </span>
                          ) : m.planned ? (
                            <span>Zaplanowane</span>
                          ) : (
                            <span>Nieużyte</span>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Usuń ${m.originalName}`}
                            onClick={async () => {
                              if (
                                !confirm(
                                  m.published
                                    ? "Usunąć medium z puli? Zdjęcie pozostanie w postach, historii i eksportach."
                                    : "Usunąć zarządzaną kopię medium z biblioteki? Oryginał poza aplikacją pozostaje bez zmian.",
                                )
                              )
                                return;
                              try {
                                await api(`media/${m.id}`, {
                                  method: "DELETE",
                                });
                                setSelected(
                                  selected.filter((id) => id !== m.id),
                                );
                                await refresh();
                                notice("Medium usunięte");
                              } catch (error) {
                                notice((error as Error).message, true);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {m.thumbnailError && (
                          <small className="thumbnail-warning">
                            {m.thumbnailError}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                  {!media.length && (
                    <p className="library-hint">
                      Każde konto ma własną bibliotekę.
                      <br />
                      Import tworzy kopię i zachowuje oryginalną jakość.
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
          <footer className="page-footer">
            <span>
              <span className="status-dot" /> Dane na Twoim Macu
            </span>
            <span>Publikujesz ręcznie. Planner pomaga przygotować resztę.</span>
            {loading && <span>Ładowanie...</span>}
          </footer>
        </>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={17} /> : <Check size={17} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Zamknij komunikat">
            <X size={15} />
          </button>
        </div>
      )}
      {showSettings && (
        <AccountSettings
          accounts={accounts}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={loadAccounts}
          notice={notice}
        />
      )}
      {editor && account && (
        <PostEditor
          key={editor.id || "new"}
          draft={editor}
          account={account}
          library={media}
          aiAvailable={!!settings?.aiAvailable}
          onClose={() => setEditor(null)}
          onSaved={refresh}
          notice={notice}
        />
      )}
    </main>
  );
}
