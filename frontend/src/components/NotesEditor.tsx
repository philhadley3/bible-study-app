"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";

/**
 * NotesEditor
 * - Stores content as HTML string
 * - Anchors are inserted as non-editable "mention" tokens: @3:12
 * - Tokens are bold + pill-styled and cannot be edited inline
 * - Backspace behavior: you can delete the whole token, but you cannot "backspace through" it character-by-character
 */

type Anchor = {
  chapter: number;
  verse: number;
};

type Props = {
  value: string; // HTML
  onChange: (nextHtml: string) => void;

  // Called when user clicks a verse in scripture pane
  pendingAnchor?: Anchor | null;

  placeholder?: string;
};

const NoSpillBackspace = Extension.create({
  name: "noSpillBackspace",
  addKeyboardShortcuts() {
    return {
      Backspace: () => false,
      Delete: () => false,
    };
  },
});

/**
 * We don't want to disable backspace/delete globally.
 * So instead of using NoSpillBackspace, we rely on Mention's atom behavior:
 * It's a single node; users can't delete inside it. They can delete it as a unit.
 * That solves "backspace through the anchor" while keeping normal editing.
 */

function anchorId(chapter: number, verse: number) {
  return `${chapter}:${verse}`;
}

export default function NotesEditor({
  value,
  onChange,
  pendingAnchor,
  placeholder = "Write your study notes here…",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // keep things simple and stable for now
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),

      Mention.configure({
        HTMLAttributes: {
          class: "afl-anchor",
        },
        renderLabel({ node }) {
          // Display without @
          return `${node.attrs.label ?? node.attrs.id}`;
        },
      }),
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
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Insert pending anchor as a non-editable token
  useEffect(() => {
    if (!editor) return;
    if (!pendingAnchor) return;

    const id = anchorId(pendingAnchor.chapter, pendingAnchor.verse);

    // Check if anchor already exists (by id)
    const html = editor.getHTML();
    if (html.includes(`data-id="${id}"`) || html.includes(`>${id}<`)) {
      return;
    }

    editor.chain().focus()
      // new paragraph before token
      .insertContent("<p></p>")
      .insertContent({
        type: "mention",
        attrs: {
          id,
          label: id,
        },
      })
      // add separator + space after anchor token
      .insertContent(" — ")
      .run();
  }, [pendingAnchor, editor]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Anchor styles + placeholder */}
      <style jsx global>{`
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgba(100, 116, 139, 0.9); /* slate-500-ish */
          pointer-events: none;
          height: 0;
        }
        .afl-anchor {
          display: inline-flex;
          align-items: center;
          font-weight: 700;
          padding: 0.1rem 0.45rem;
          border-radius: 9999px;
          border: 1px solid rgba(148, 163, 184, 0.9); /* slate-400 */
          background: rgba(241, 245, 249, 1); /* slate-100 */
          color: rgba(15, 23, 42, 1); /* slate-900 */
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
