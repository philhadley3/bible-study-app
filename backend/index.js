import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

dotenv.config();

const app = express();
app.use(express.json());

// Allow local dev + Vercel later (tighten if you want)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
  })
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * ---- Darby Loader (Zefania XML) ----
 * Source file: backend/data/eng-darby.zefania.xml
 *
 * Zefania structure is typically:
 * XMLBIBLE > BIBLEBOOK[] > CHAPTER[] > VERS[]
 */

function normalizeBookName(name) {
  if (!name) return "";
  let s = String(name).trim().toLowerCase();

  // Common punctuation normalization
  s = s.replace(/[’']/g, "'").replace(/\./g, "");

  // Normalize leading roman numerals (very common in some datasets)
  s = s.replace(/^i{3}\s+/, "3 ");
  s = s.replace(/^ii\s+/, "2 ");
  s = s.replace(/^i\s+/, "1 ");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ");

  // A couple common aliases
  if (s === "song of songs") s = "song of solomon";
  if (s === "canticles") s = "song of solomon";
  if (s === "psalm") s = "psalms";

  return s;
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// Build an in-memory index:
// bookIndex.get(normalizedBookName).get(chapterNumber) => [{v, t}, ...]
const bookIndex = new Map();

function loadDarby() {
  const filePath = path.join(process.cwd(), "data", "eng-darby.zefania.xml");
  const xml = fs.readFileSync(filePath, "utf8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // keep text nodes as "#text"
    textNodeName: "#text",
    // preserve order not needed
  });

  const parsed = parser.parse(xml);

  const xmlbible =
    parsed?.XMLBIBLE ||
    parsed?.xmlbible ||
    parsed?.ZEFANIA ||
    parsed?.zefania;

  if (!xmlbible) {
    throw new Error("Could not find XMLBIBLE root in Darby XML.");
  }

  const books = asArray(xmlbible.BIBLEBOOK);

  for (const b of books) {
    const rawName = b?.["@_bname"] || b?.["@_bname_short"] || b?.["@_bsname"] || "";
    const normalized = normalizeBookName(rawName);
    if (!normalized) continue;

    const chapterMap = new Map();

    const chapters = asArray(b.CHAPTER);
    for (const ch of chapters) {
      const cnum = Number(ch?.["@_cnumber"]);
      if (!cnum) continue;

      const verses = asArray(ch.VERS).map((v) => {
        const vnum = Number(v?.["@_vnumber"]);
        const text =
          typeof v === "string"
            ? v
            : (v?.["#text"] ?? "").toString();

        return {
          v: vnum,
          t: text.trim(),
        };
      }).filter((x) => x.v && x.t);

      chapterMap.set(cnum, verses);
    }

    bookIndex.set(normalized, chapterMap);
  }

  // Basic sanity count
  return { books: bookIndex.size };
}

let darbyInfo = { books: 0 };

try {
  darbyInfo = loadDarby();
  console.log(`Loaded Darby XML: ${darbyInfo.books} books indexed.`);
} catch (err) {
  console.error("Failed to load Darby XML:", err?.message || err);
  // Keep server running so /health still works; /scripture will error clearly.
}

/**
 * GET /scripture?book=John&chapter=3
 */
app.get("/scripture", (req, res) => {
  const book = String(req.query.book || "");
  const chapter = Number(req.query.chapter || 0);

  if (!book || !chapter) {
    return res.status(400).json({
      error: "Missing required query params: book, chapter",
    });
  }

  if (!bookIndex.size) {
    return res.status(500).json({
      error: "Darby dataset not loaded on server (check XML file path).",
    });
  }

  const normalized = normalizeBookName(book);
  const chapterMap = bookIndex.get(normalized);

  if (!chapterMap) {
    return res.json({
      translation: "Darby",
      reference: `${book} ${chapter}`,
      verses: [],
    });
  }

  const verses = chapterMap.get(chapter) || [];

  return res.json({
    translation: "Darby",
    reference: `${book} ${chapter}`,
    verses,
  });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
