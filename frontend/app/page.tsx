"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOKS } from "../src/lib/bible";

type ScriptureResponse = {
  translation: string;
  reference: string;
  verses: { v: number; t: string }[];
};

export default function Home() {
  const [book, setBook] = useState<string>("");
  const [chapter, setChapter] = useState<number | "">("");

  const [notes, setNotes] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [scripture, setScripture] = useState<ScriptureResponse | null>(null);
  const [error, setError] = useState<string>("");

  const notesKey = book && chapter !== "" ? `notes:${book}:${chapter}` : "";

  const notesRef = useRef<HTMLTextAreaElement | null>(null);

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

  function insertAnchor(verse: number) {
    if (chapter === "") return;

    const anchor = `**${chapter}:${verse}** `;
    const textarea = notesRef.current;

    // If we can't access selection, just append cleanly.
    if (!textarea) {
      setNotes((prev) => (prev ? `${prev}\n\n${anchor}` : anchor));
      return;
    }

    const start = textarea.selectionStart ?? notes.length;
    const end = textarea.selectionEnd ?? notes.length;

    // Ensure anchor starts on a new paragraph
    const prefixNeedsBreak =
      start > 0 && !notes.slice(0, start).endsWith("\n\n");

    const insertText = `${prefixNeedsBreak ? "\n\n" : ""}${anchor}`;

    const next =
      notes.slice(0, start) + insertText + notes.slice(end);

    setNotes(next);

    // Focus and place cursor after the anchor text
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + insertText.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  async function handleLoad() {
    setError("");

    if (!book || chapter === "") {
      setError("Pick a book and chapter first.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/scripture?book=${encodeURIComponent(
          book
        )}&chapter=${encodeURIComponent(String(chapter))}`
      );

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = (await res.json()) as ScriptureResponse;
      setScripture(data);

      if (!data.verses?.length) {
        setError("No verses returned for this selection yet.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top bar */}
        <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-xl font-semibold text-slate-900">
                Bible Study
              </h1>

              <div className="flex w-full gap-2 sm:max-w-2xl">
                <input
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder='Search (coming soon) — e.g., "John 3:16–18"'
                />
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                  type="button"
                  onClick={() => {
                    setError("Search wiring comes next. For now use dropdowns.");
                  }}
                >
                  Go
                </button>
              </div>
            </div>

            {/* Dropdown row */}
            <div className="grid gap-2 sm:grid-cols-6">
              {/* Book */}
              <select
                value={book}
                onChange={(e) => {
                  setBook(e.target.value);
                  setChapter("");
                  setScripture(null);
                  setError("");
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

              {/* Chapter */}
              <select
                value={chapter === "" ? "" : String(chapter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setChapter(v === "" ? "" : Number(v));
                  setScripture(null);
                  setError("");
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

        {/* Two-pane layout */}
        <section className="grid gap-6 lg:grid-cols-2 lg:h-[75vh]">
          {/* Left: Bible text */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col h-full min-h-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Scripture
              </h2>
              <span className="text-sm text-slate-500">
                {scripture?.translation ?? "—"}
              </span>
            </div>

            {!scripture ? (
              <p className="text-slate-500">
                Select a book and chapter, then press <strong>Load</strong>.
                (Try <strong>John 3</strong> or <strong>Genesis 1</strong>.)
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  <strong>{scripture.reference}</strong>
                </p>

                <div className="mt-3 flex-1 min-h-0 overflow-auto pr-2">
                  {scripture.verses.length === 0 ? (
                    <p className="text-slate-500">
                      No verses returned for this selection yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {scripture.verses.map((x) => (
                        <p key={x.v} className="leading-relaxed text-slate-900">
                          <button
                            type="button"
                            onClick={() => insertAnchor(x.v)}
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
