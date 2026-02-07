"use client";

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Node } from "@tiptap/core";

type Anchor = {
  chapter: number;
  verse: number;
};

type Props = {
  value: string; // HTML
  onChange: (nextHtml: string) => void;

  // When user clicks a verse in scripture pane
  pendingAnchor?: Anchor | null;

  placeholder?: string;
};

function anchorId(chapter: number, verse: number) {
  return `${chapter}:${verse}`;
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
      id: { default: "" }, // e.g. "3:12"
      label: { default: "" }, // e.g. "3:12 –"
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-anchor="true"]',
      },
    ];
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

  // Insert pending anchor as a single atomic node: "3:12 –"
  useEffect(() => {
    if (!editor) return;
    if (!pendingAnchor) return;

    const id = anchorId(pendingAnchor.chapter, pendingAnchor.verse);
    const label = `${id} –`;

    // Prevent duplicates: look for data-anchor-id="3:12"
    const html = editor.getHTML();
    if (html.includes(`data-anchor-id="${id}"`)) return;

    editor
      .chain()
      .focus()
      // Start on a new paragraph line for cleanliness
      .insertContent("<p></p>")
      .insertContent({
        type: "anchor",
        attrs: { id, label },
      })
      // Space after the anchor so typing feels natural
      .insertContent(" ")
      .run();
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

        /* Anchor styling: bold, professional, NOT a bubble */
        .afl-anchor {
          font-weight: 700;
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
