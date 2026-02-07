"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

type Anchor = {
  chapter: number;
  verse: number;
};

type Props = {
  value: string; // HTML
  onChange: (nextHtml: string) => void;
  pendingAnchor?: Anchor | null;
  placeholder?: string;
};

function anchorId(chapter: number, verse: number) {
  return `${chapter}:${verse}`;
}
function verseFromId(id: string) {
  const m = id.match(/^\s*\d+:(\d+)\s*$/);
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * Inline atom node that renders as bold "3:12 –"
 * - atomic: cannot edit inside
 * - deleting removes the whole node
 */
const AnchorNode = Node.create({
  name: "anchor",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: "" },    // "3:12"
      label: { default: "" }, // "3:12 –"
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-anchor="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-anchor": "true",
        "data-anchor-id": HTMLAttributes.id,
        class: "afl-anchor",
      },
      HTMLAttributes.label,
    ];
  },
});

export default function NotesEditor({
  value,
  onChange,
  pendingAnchor,
  placeholder = "Write your study notes here…",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      AnchorNode,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[420px] h-full w-full rounded-xl border border-slate-300 bg-white p-4 text-slate-900 focus:outline-none",
        "data-placeholder": placeholder,
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Keep editor in sync if value changes externally (chapter switch)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  /**
   * Utility: detect whether a top-level block starts with an anchor node.
   * We treat: paragraph starting with [anchor] as the start of an "anchor group".
   */
  function blockStartsWithAnchor(block: any) {
    if (!block || !block.content || !Array.isArray(block.content)) return false;
    const first = block.content[0];
    return first?.type === "anchor" && typeof first?.attrs?.id === "string";
  }

  /**
   * Sort anchor "groups" at the top-level:
   * - Everything before the first anchor-group stays as "general notes"
   * - Each anchor-group = from an anchor-start block up to (but not including) the next anchor-start block
   * - Sort groups by verse number
   */
  function sortAnchorGroupsInDoc() {
    if (!editor) return;

    const json = editor.getJSON();
    const content = Array.isArray(json.content) ? json.content : [];

    // Find first anchor-start block index
    const firstAnchorIdx = content.findIndex((b) => blockStartsWithAnchor(b));
    if (firstAnchorIdx === -1) return; // nothing to sort

    const pre = content.slice(0, firstAnchorIdx);

    // Build groups
    const groups: { verse: number; blocks: any[] }[] = [];
    let i = firstAnchorIdx;

    while (i < content.length) {
      if (!blockStartsWithAnchor(content[i])) {
        // If user has stray blocks after anchors, attach them to last group if possible
        if (groups.length) {
          groups[groups.length - 1].blocks.push(content[i]);
        } else {
          pre.push(content[i]);
        }
        i++;
        continue;
      }

      const anchorBlock = content[i];
      const firstInline = (anchorBlock as any)?.content?.[0];
      const id = (firstInline as any)?.attrs?.id ?? "";
      const verse = verseFromId(String(id));

      const blocks: any[] = [anchorBlock];
      i++;

      while (i < content.length && !blockStartsWithAnchor(content[i])) {
        blocks.push(content[i]);
        i++;
      }

      groups.push({
        verse: Number.isFinite(verse) ? verse : 9999,
        blocks,
      });
    }

    const sorted = [...groups].sort((a, b) => a.verse - b.verse);
    const nextContent = [...pre, ...sorted.flatMap((g) => g.blocks)];

    // Only update if changed (simple check)
    const nextJson = { ...json, content: nextContent };
    editor.commands.setContent(nextJson, { emitUpdate: true });
  }

  /**
   * Jump cursor to the END of the anchor group for a given id (e.g. "3:12").
   */
  function jumpToAnchorGroupEnd(id: string) {
    if (!editor) return;

    const state = editor.state;
    const doc = state.doc;

    // Find top-level block indexes and their starting positions
    type BlockInfo = { index: number; pos: number; node: any; isAnchorStart: boolean; anchorId?: string };
    const blocks: BlockInfo[] = [];
    let pos = 0;

    // Top-level blocks begin at pos+1 in ProseMirror; easiest is to iterate doc.content and track pos
    // In PM, each node contributes node.nodeSize to positions
    doc.forEach((node, offset, index) => {
      // offset is position *inside* doc (starts at 0), actual pos for selection is offset + 1
      const actualPos = offset + 1;

      let isAnchorStart = false;
      let anchorIdVal: string | undefined;

      // detect paragraph starting with anchor
      if (node.type.name === "paragraph" && node.content.size > 0) {
        const firstChild = node.child(0);
        if (firstChild.type.name === "anchor") {
          isAnchorStart = true;
          anchorIdVal = String(firstChild.attrs?.id ?? "");
        }
      }

      blocks.push({
        index,
        pos: actualPos,
        node,
        isAnchorStart,
        anchorId: anchorIdVal,
      });

      pos = actualPos;
    });

    const startIdx = blocks.findIndex((b) => b.isAnchorStart && b.anchorId === id);
    if (startIdx === -1) return;

    // Group ends right before the next anchor-start block (or end of doc)
    const nextAnchorIdx = blocks.findIndex((b, idx) => idx > startIdx && b.isAnchorStart);
    const endIdx = nextAnchorIdx === -1 ? blocks.length - 1 : nextAnchorIdx - 1;

    const endBlock = blocks[endIdx];
    const endPos = endBlock.pos + endBlock.node.nodeSize - 1; // inside the end node

    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endPos))
    );
    editor.view.focus();

    // Ensure it scrolls into view
    editor.commands.scrollIntoView();
  }

  /**
   * Insert pending anchor as a single atomic node: "3:12 –"
   * - If it already exists: jump to its note group end (no duplicate)
   * - If new: insert + then sort + then jump to its group end
   */
  useEffect(() => {
    if (!editor) return;
    if (!pendingAnchor) return;

    const id = anchorId(pendingAnchor.chapter, pendingAnchor.verse);
    const label = `${id} –`;

    // If anchor exists, jump (don’t insert)
    const html = editor.getHTML();
    if (html.includes(`data-anchor-id="${id}"`)) {
      jumpToAnchorGroupEnd(id);
      return;
    }

    // Insert on a fresh paragraph line
    editor
      .chain()
      .focus()
      .insertContent("<p></p>")
      .insertContent({
        type: "anchor",
        attrs: { id, label },
      })
      .insertContent(" ")
      .run();

    // Now sort all anchor groups and jump to the end of this anchor's group
    // Use a tick to let PM state settle
    setTimeout(() => {
      sortAnchorGroupsInDoc();
      // After sorting, jump again to ensure cursor lands correctly
      jumpToAnchorGroupEnd(id);
    }, 0);
  }, [pendingAnchor, editor]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <style jsx global>{`
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgba(100, 116, 139, 0.9);
          pointer-events: none;
          height: 0;
        }

        /* Anchor styling: bold, professional (not a bubble) */
        .afl-anchor {
          font-weight: 800;
          color: rgba(15, 23, 42, 1);
          user-select: none;
          white-space: nowrap;
        }
      `}</style>

      <div className="flex-1 min-h-0 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
