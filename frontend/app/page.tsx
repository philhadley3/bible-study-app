"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOKS } from "../src/lib/bible";
import NotesEditor from "../src/components/NotesEditor";

type ScriptureResponse = {
  translation: string;
  reference: string;
  verses: { v: number; t: string }[];
};

type ParsedRef = {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
};

function stripHtml(html: string) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/?p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export default function Home() {
  const [book, setBook] = useState<string>("");
  const [chapter, setChapter] = useState<number | "">("");

  // Notes are now stored as HTML
  const [notesHtml, setNotesHtml] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [scripture, setScripture] = useState<ScriptureResponse | null>(null);
  const [error, setError] = useState<string>("");

  const [activeVerse, setActiveVerse] = useState<number | null>(null);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);

  const [searchText, setSearchText] = useState<string>("");

  // When user clicks a verse, we set a pending anchor for NotesEditor to insert.
  const [pendingAnchor, setPendingAnchor] = useState<{ chapter: number; verse: number } | null>(
    null
  );

  const notesKey = book && chapter !== "" ? `notesHtml:${book}:${chapter}` : "";

  const chapterOptions = useMemo(() => {
    if (!book) return [];
    const chapters = BOOKS.find((b) => b.name === book)?.chapters ?? 0;
    return Array.from({ length: chapters }, (_, i) => i + 1);
  }, [book]);

  // Load notes when book/chapter changes
  useEffect(() => {
    if (!notesKey) {
      setNotesHtml("");
      return;
    }
    const saved = localStorage.getItem(notesKey);
    setNotesHtml(saved ?? "");
  }, [notesKey]);

  // Autosave notes as you type
  useEffect(() => {
    if (!notesKey) return;
    localStorage.setItem(notesKey, notesHtml);
  }, [notesKey, notesHtml]);

  // Scroll active verse into view after load/search
  useEffect(() => {
    if (!activeVerse) return;
    const el = document.getElementById(`verse-${activeVerse}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeVerse, scripture?.reference]);

  function normalizeBookKey(s: string) {
    return s
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Build aliases from BOOKS + common abbreviations
  const bookAliasToName = useMemo(() => {
    const map = new Map<string, string>();
    const add = (alias: string, full: string) => map.set(normalizeBookKey(alias), full);

    for (const b of BOOKS) {
      add(b.name, b.name);
      add(normalizeBookKey(b.name).replace(/\s+/g, ""), b.name);
    }

    // Common abbreviations (expand later if desired)
    add("gen", "Genesis");
    add("ex", "Exodus");
    add("lev", "Leviticus");
    add("num", "Numbers");
    add("deut", "Deuteronomy");

    add("jos", "Joshua");
    add("judg", "Judges");
    add("rut", "Ruth");

    add("ps", "Psalms");
    add("psalm", "Psalms");
    add("prov", "Proverbs");
    add("eccl", "Ecclesiastes");
    add("song", "Song of Solomon");

    add("mt", "Matthew");
    add("matt", "Matthew");
    add("mk", "Mark");
    add("mrk", "Mark");
    add("lk", "Luke");
    add("jn", "John");
    add("jhn", "John");
    add("acts", "Acts");
    add("rom", "Romans");

    // 1/2 books (examples)
    add("1 cor", "1 Corinthians");
    add("1cor", "1 Corinthians");
    add("i cor", "1 Corinthians");
    add("2 cor", "2 Corinthians");
    add("2cor", "2 Corinthians");
    add("ii cor", "2 Corinthians");

    add("1 thess", "1 Thessalonians");
    add("2 thess", "2 Thessalonians");
    add("1 tim", "1 Timothy");
    add("2 tim", "2 Timothy");

    add("1 pet", "1 Peter");
    add("2 pet", "2 Peter");
    add("1 jn", "1 John");
    add("2 jn", "2 John");
    add("3 jn", "3 John");

    add("rev", "Revelation");

    return map;
  }, []);

  function parseReference(input: string): ParsedRef | null {
    const raw = input.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    if (!raw) return null;

    const re =
      /^(.+?)\s+(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$/;

    const m = raw.match(re);
    if (!m) return null;

    let bookPart = normalizeBookKey(m[1]);
    const ch = Number(m[2]);
    const v1 = m[3] ? Number(m[3]) : undefined;
    const v2 = m[4] ? Number(m[4]) : undefined;

    bookPart = bookPart.replace(/^iii\s+/, "3 ");
    bookPart = bookPart.replace(/^ii\s+/, "2 ");
    bookPart = bookPart.replace(/^i\s+/, "1 ");

    const found =
      bookAliasToName.get(bookPart) ||
      bookAliasToName.get(bookPart.replace(/\s+/g, "")) ||
      null;

    if (!found) return null;
    if (!ch || ch < 1) return null;

    const result: ParsedRef = { book: found, chapter: ch };
    if (v1 && v1 >= 1) result.verseStart = v1;
    if (v2 && v2 >= 1) result.verseEnd = v2;

    return result;
  }

  async function loadScripture(explicitBook: string, explicitChapter: number) {
    setError("");

    try {
      setLoading(true);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/scripture?book=${encodeURIComponent(
          explicitBook
        )}&chapter=${encodeURIComponent(String(explicitChapter))}`
      );

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = (await res.json()) as ScriptureResponse;
      setScripture(data);

      if (!data.verses?.length) {
        setError("No verses returned for that selection yet.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoad() {
    if (!book || chapter === "") {
      setError("Pick a book and chapter first.");
      return;
    }
    await loadScripture(book, Number(chapter));
  }

  async function handleSearchGo() {
    setError("");

    const parsed = parseReference(searchText);
    if (!parsed) {
      setError('Could not parse that reference. Try: "Jn 3:16", "1 Cor 13", "John 3:16-18".');
      return;
    }

    setBook(parsed.book);
    setChapter(parsed.chapter);
    setScripture(null);

    await loadScripture(parsed.book, parsed.chapter);

    if (parsed.verseStart) {
      setActiveVerse(parsed.verseStart);

      if (parsed.verseEnd && parsed.verseEnd >= parsed.verseStart) {
        setActiveRange({ start: parsed.verseStart, end: parsed.verseEnd });
      } else {
        setActiveRange({ start: parsed.verseStart, end: parsed.verseStart });
      }
    } else {
      setActiveVerse(null);
      setActiveRange(null);
    }
  }

  async function copyNotes() {
    if (!book || chapter === "") {
      setError("Pick a book and chapter first.");
      return;
    }

    const header = `${book} ${chapter}\n\n`;
    const body = stripHtml(notesHtml) || "(no notes)";
    const text = header + body;

    try {
      await navigator.clipboard.writeText(text);
      setError("");
      alert("Notes copied to clipboard.");
    } catch {
      setError("Could not copy to clipboard (browser blocked).");
    }
  }

  function downloadNotes() {
    if (!book || chapter === "") {
      setError("Pick a book and chapter first.");
      return;
    }

    const header = `${book} ${chapter}\n\n`;
    const body = stripHtml(notesHtml) || "(no notes)";
    const text = header + body;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    const safeBook = book.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    a.download = `${safeBook}_${chapter}_notes.txt`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function onVerseClick(v: number) {
    if (chapter === "") return;
    setActiveVerse(v);

    // Tell NotesEditor to insert an anchor token (non-editable)
    setPendingAnchor({ chapter: Number(chapter), verse: v });

    // Clear pending after it triggers (so repeated clicks still work)
    setTimeout(() => setPendingAnchor(null), 0);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-xl font-semibold text-slate-900">Bible Study</h1>

              <div className="flex w-full gap-2 sm:max-w-2xl">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearchGo();
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder='Search (e.g., "Jn 3:16", "1 Cor 13", "John 3:16-18")'
                />
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                  type="button"
                  onClick={handleSearchGo}
                >
                  Go
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-6">
              <select
                value={book}
                onChange={(e) => {
                  setBook(e.target.value);
                  setChapter("");
                  setScripture(null);
                  setError("");
                  setActiveVerse(null);
                  setActiveRange(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 sm:col-span-3"
              >
                <option value="">Book</option>
                {BOOKS.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                value={chapter === "" ? "" : String(chapter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setChapter(v === "" ? "" : Number(v));
                  setScripture(null);
                  setError("");
                  setActiveVerse(null);
                  setActiveRange(null);
                }}
                disabled={!book}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 sm:col-span-2"
              >
                <option value="">Chapter</option>
                {chapterOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>

              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
                type="button"
                onClick={handleLoad}
                disabled={loading}
              >
                {loading ? "Loading…" : "Load"}
              </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2 lg:h-[75vh]">
          {/* Left: Scripture */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col h-full min-h-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Scripture</h2>
              <span className="text-sm text-slate-500">{scripture?.translation ?? "—"}</span>
            </div>

            {!scripture ? (
              <p className="text-slate-500">
                Select a book and chapter, then press <strong>Load</strong>. Or use search above.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  <strong>{scripture.reference}</strong>
                </p>

                <div className="mt-3 flex-1 min-h-0 overflow-auto pr-2">
                  {scripture.verses.length === 0 ? (
                    <p className="text-slate-500">No verses returned for this selection yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {scripture.verses.map((x) => (
                        <p
                          key={x.v}
                          id={`verse-${x.v}`}
                          className={`leading-relaxed text-slate-900 rounded-lg px-2 py-1 -mx-2 ${
                            activeRange && x.v >= activeRange.start && x.v <= activeRange.end
                              ? "bg-slate-100 ring-1 ring-slate-200"
                              : activeVerse === x.v
                              ? "bg-slate-100 ring-1 ring-slate-200"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onVerseClick(x.v)}
                            className="mr-2 inline-flex w-10 shrink-0 items-center justify-end text-sm font-semibold text-slate-500 hover:text-slate-900"
                            title={`Add note anchor ${chapter === "" ? "" : chapter}:${x.v}`}
                          >
                            {x.v}
                          </button>
                          <span>{x.t}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Notes */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col h-full min-h-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Notes</h2>

              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">Autosave</span>
                <button
                  type="button"
                  onClick={copyNotes}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-50"
                >
                  Copy Notes
                </button>
                <button
                  type="button"
                  onClick={downloadNotes}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-50"
                >
                  Download
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <NotesEditor
                value={notesHtml}
                onChange={setNotesHtml}
                pendingAnchor={pendingAnchor}
                placeholder="Write your study notes here…"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
