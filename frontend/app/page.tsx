"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOKS } from "../src/lib/bible";

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

export default function Home() {
  const [book, setBook] = useState<string>("");
  const [chapter, setChapter] = useState<number | "">("");

  const [notes, setNotes] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [scripture, setScripture] = useState<ScriptureResponse | null>(null);
  const [error, setError] = useState<string>("");

  const [activeVerse, setActiveVerse] = useState<number | null>(null);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);

  const [searchText, setSearchText] = useState<string>("");

  const notesKey = book && chapter !== "" ? `notes:${book}:${chapter}` : "";
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  // Used to scroll verse into view in the Scripture pane
  const scriptureScrollRef = useRef<HTMLDivElement | null>(null);

  const chapterOptions = useMemo(() => {
    if (!book) return [];
    const chapters = BOOKS.find((b) => b.name === book)?.chapters ?? 0;
    return Array.from({ length: chapters }, (_, i) => i + 1);
  }, [book]);

  // Load notes when book/chapter changes
  useEffect(() => {
    if (!notesKey) {
      setNotes("");
      return;
    }
    const saved = localStorage.getItem(notesKey);
    setNotes(saved ?? "");
  }, [notesKey]);

  // Autosave notes as you type
  useEffect(() => {
    if (!notesKey) return;
    localStorage.setItem(notesKey, notes);
  }, [notesKey, notes]);

  // Scroll active verse into view (after scripture is loaded/rendered)
  useEffect(() => {
    if (!activeVerse) return;
    const el = document.getElementById(`verse-${activeVerse}`);
    if (!el) return;
    // Scroll within the scripture container (not the whole page)
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

  // Build an alias map for search (based on current BOOKS + a few common abbreviations)
  const bookAliasToName = useMemo(() => {
    const map = new Map<string, string>();

    const add = (alias: string, full: string) => map.set(normalizeBookKey(alias), full);

    for (const b of BOOKS) {
      add(b.name, b.name);

      // Useful generic aliases
      const key = normalizeBookKey(b.name);
      add(key.replace(/\s+/g, ""), b.name); // "1corinthians"
      add(key.replace(/\s+/g, " "), b.name);

      // First word/short forms for multi-word books
      // (handled better with explicit aliases below)
    }

    // Explicit common abbreviations (for your current BOOKS set)
    add("gen", "Genesis");
    add("ge", "Genesis");

    add("ex", "Exodus");
    add("exo", "Exodus");

    add("lev", "Leviticus");
    add("lv", "Leviticus");

    add("num", "Numbers");
    add("nm", "Numbers");

    add("deut", "Deuteronomy");
    add("dt", "Deuteronomy");

    add("mt", "Matthew");
    add("matt", "Matthew");

    add("mk", "Mark");
    add("mrk", "Mark");

    add("lk", "Luke");
    add("luk", "Luke");

    add("jn", "John");
    add("jhn", "John");

    add("acts", "Acts");
    add("ac", "Acts");

    add("rom", "Romans");
    add("ro", "Romans");

    add("1 cor", "1 Corinthians");
    add("1cor", "1 Corinthians");
    add("i cor", "1 Corinthians");
    add("1 corinthians", "1 Corinthians");

    add("2 cor", "2 Corinthians");
    add("2cor", "2 Corinthians");
    add("ii cor", "2 Corinthians");
    add("2 corinthians", "2 Corinthians");

    add("rev", "Revelation");
    add("re", "Revelation");

    return map;
  }, []);

  function parseReference(input: string): ParsedRef | null {
    // Normalize dashes and whitespace
    const raw = input
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (!raw) return null;

    // Pattern:
    // <book> <chapter> [ ":" <verseStart> [ "-" <verseEnd> ] ]
    // book can include leading number/roman numeral and spaces (e.g., "1 Cor", "II Corinthians")
    const re =
      /^(.+?)\s+(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$/;

    const m = raw.match(re);
    if (!m) return null;

    let bookPart = normalizeBookKey(m[1]);
    const ch = Number(m[2]);
    const v1 = m[3] ? Number(m[3]) : undefined;
    const v2 = m[4] ? Number(m[4]) : undefined;

    // Normalize roman numerals at start
    bookPart = bookPart.replace(/^iii\s+/, "3 ");
    bookPart = bookPart.replace(/^ii\s+/, "2 ");
    bookPart = bookPart.replace(/^i\s+/, "1 ");

    // Try direct alias lookup
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

  function sortAnchoredNotes(raw: string, ch: number) {
    const text = raw ?? "";
    if (!text.trim()) return text;

    const anchorRe = new RegExp(
      `^\\s*${ch}:(\\d{1,3})\\s*(?:[—\\-:]\\s*)?.*$`
    );

    const lines = text.split("\n");

    const anchorIdxs: { i: number; v: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const mm = lines[i].match(anchorRe);
      if (mm) anchorIdxs.push({ i, v: Number(mm[1]) });
    }

    if (anchorIdxs.length === 0) return text;

    const blocks: { verse: number; content: string }[] = [];
    for (let k = 0; k < anchorIdxs.length; k++) {
      const start = anchorIdxs[k].i;
      const end = k + 1 < anchorIdxs.length ? anchorIdxs[k + 1].i : lines.length;
      const verse = anchorIdxs[k].v;
      const content = lines.slice(start, end).join("\n").trimEnd();
      blocks.push({ verse, content });
    }

    const pre = lines.slice(0, anchorIdxs[0].i).join("\n").trimEnd();

    blocks.sort((a, b) => a.verse - b.verse);

    const sortedAnchors = blocks.map((b) => b.content).join("\n\n").trimEnd();

    if (pre.trim()) return `${pre}\n\n${sortedAnchors}`.trimEnd();
    return sortedAnchors;
  }

  function findAnchorIndex(text: string, ch: number, verse: number) {
    const target = `${ch}:${verse}`;
    const re = new RegExp(`(^|\\n)\\s*${target}(\\s|$)`, "m");
    const m = text.match(re);
    if (!m) return -1;

    const idx = m.index ?? -1;
    if (idx < 0) return -1;

    if (text[idx] === "\n") return idx + 1;
    return idx;
  }

  function jumpToAnchor(text: string, ch: number, verse: number) {
    const textarea = notesRef.current;
    if (!textarea) return;

    const target = `${ch}:${verse}`;
    const anchorStart = findAnchorIndex(text, ch, verse);

    let cursorPos = anchorStart >= 0 ? anchorStart + target.length : text.length;

    if (anchorStart >= 0) {
      const lineEnd = text.indexOf("\n", anchorStart);
      const line = text.slice(anchorStart, lineEnd >= 0 ? lineEnd : undefined);
      const sepMatch = line.match(
        new RegExp(`^\\s*${target}\\s*(?:[—\\-:]\\s*)?`)
      );
      if (sepMatch?.[0]) cursorPos = anchorStart + sepMatch[0].length;
    }

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);

      const before = text.slice(0, cursorPos);
      const lineCount = before.split("\n").length;
      const lineHeight = 20;
      textarea.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
    });
  }

  function insertOrJumpAnchor(verse: number) {
    if (chapter === "") return;

    setActiveVerse(verse);

    const ch = chapter;
    const targetIdx = findAnchorIndex(notes, ch, verse);

    if (targetIdx >= 0) {
      jumpToAnchor(notes, ch, verse);
      return;
    }

    const anchorLine = `${ch}:${verse} — `;
    const textarea = notesRef.current;

    if (!textarea) {
      const nextRaw = notes ? `${notes}\n\n${anchorLine}` : anchorLine;
      const nextSorted = sortAnchoredNotes(nextRaw, ch);
      setNotes(nextSorted);
      jumpToAnchor(nextSorted, ch, verse);
      return;
    }

    const start = textarea.selectionStart ?? notes.length;
    const end = textarea.selectionEnd ?? notes.length;

    const prefixNeedsBreak = start > 0 && !notes.slice(0, start).endsWith("\n\n");
    const insertText = `${prefixNeedsBreak ? "\n\n" : ""}${anchorLine}`;

    const nextRaw = notes.slice(0, start) + insertText + notes.slice(end);
    const nextSorted = sortAnchoredNotes(nextRaw, ch);

    setNotes(nextSorted);
    jumpToAnchor(nextSorted, ch, verse);
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
      setError(
        'Could not parse that reference. Try: "Jn 3:16", "1 Cor 13", "John 3:16-18".'
      );
      return;
    }

    setBook(parsed.book);
    setChapter(parsed.chapter);
    setScripture(null);

    // Load after state updates (use explicit args so no race)
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
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col h-full min-h-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Scripture</h2>
              <span className="text-sm text-slate-500">{scripture?.translation ?? "—"}</span>
            </div>

            {!scripture ? (
              <p className="text-slate-500">
                Select a book and chapter, then press <strong>Load</strong>. Or use search
                above (e.g., <strong>Jn 3:16</strong>).
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  <strong>{scripture.reference}</strong>
                </p>

                <div
                  ref={scriptureScrollRef}
                  className="mt-3 flex-1 min-h-0 overflow-auto pr-2"
                >
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
                            : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => insertOrJumpAnchor(x.v)}
                            className="mr-2 inline-flex w-10 shrink-0 items-center justify-end text-sm font-semibold text-slate-500 hover:text-slate-900"
                            title={`Add/jump note anchor ${chapter === "" ? "" : chapter}:${x.v}`}
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

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col h-full min-h-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
              <span className="text-sm text-slate-500">Autosave</span>
            </div>

            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 min-h-0 w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="Write your study notes here…"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
