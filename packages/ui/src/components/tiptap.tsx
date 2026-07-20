"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  CodeXml,
  Heading1,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Variable,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "#lib/utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { FieldLabel } from "./field";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";

const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "video" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: true,
        class: "w-full rounded-md my-2",
      }),
    ];
  },
});

export interface TiptapProps {
  value: string;
  onChange?: (html: string) => void;
  variables?: string[];
  id?: string;
  className?: string;
  editable?: boolean;
  onUploadFile?: (file: File) => Promise<string>;
}

interface ToolbarButtonProps {
  editor: Editor | null;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({
  editor,
  onClick,
  active,
  disabled,
  label,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active ?? undefined}
      data-active={active ? "" : undefined}
      disabled={disabled || !editor}
      className="data-[active]:bg-muted data-[active]:text-foreground"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function Tiptap({
  value,
  onChange,
  variables,
  id,
  className,
  editable = true,
  onUploadFile,
}: TiptapProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: {
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
            class: "text-primary underline underline-offset-2",
          },
        },
      }),
      Image,
      FileHandler.configure({
        allowedMimeTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "video/mp4",
          "video/webm",
        ],
        onPaste: async (editor, files) => {
          for (const file of files) {
            await handleFile(editor, file);
          }
        },
        onDrop: async (editor, files, pos) => {
          for (const file of files) {
            await handleFile(editor, file, { pos });
          }
        },
      }),
      VideoNode,
    ],
    content: value || "",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": "Rich text editor",
        class:
          "prose-tiptap min-h-32 max-h-80 overflow-y-auto px-3 py-2 outline-none text-base md:text-sm",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const isVariableEnabled = !!variables && variables.length > 0;
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function handleFile(
    editor: Editor,
    file: File,
    insertAt?: { pos: number },
  ) {
    const url = await onUploadFile?.(file);
    if (!url) return;

    if (file.type.startsWith("image/")) {
      const chain = insertAt
        ? editor.chain().focus().setTextSelection(insertAt.pos)
        : editor.chain().focus();
      chain.setImage({ src: url }).run();
    } else if (file.type.startsWith("video/")) {
      const chain = insertAt
        ? editor.chain().focus().setTextSelection(insertAt.pos)
        : editor.chain().focus();
      chain.insertContent({ type: "video", attrs: { src: url } }).run();
    }
  }

  function insertVariable(name: string) {
    const chain = editor?.chain().focus();
    if (!chain) return;
    if (editor?.isActive("link")) {
      chain.extendMarkRange("link").unsetLink();
    }
    if (editor?.isActive("code")) {
      chain.unsetCode();
    }
    chain.insertContent(`{{${name}}}`).run();
  }

  function handleLinkOpenChange(open: boolean) {
    setLinkOpen(open);
    if (open && editor) {
      const { from, to, empty } = editor.state.selection;
      setLinkUrl(editor.getAttributes("link").href ?? "");
      setLinkText(empty ? "" : editor.state.doc.textBetween(from, to, " "));
    }
  }

  function handleLinkSubmit() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) return;
    const text = linkText.trim();
    const { from, to, empty } = editor.state.selection;
    const currentText = empty
      ? ""
      : editor.state.doc.textBetween(from, to, " ");

    if (empty || (currentText && currentText !== text)) {
      const label = text || url;
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
    setLinkOpen(false);
  }

  function handleLinkKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      handleLinkSubmit();
    }
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div
      data-slot="tiptap"
      className={cn(
        "flex flex-col rounded-lg border border-input bg-transparent transition-colors ring-inset focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <ToolbarButton
          editor={editor}
          label="Bold"
          active={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Italic"
          active={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Strikethrough"
          active={editor?.isActive("strike") ?? false}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolbarButton
          editor={editor}
          label="Heading 1"
          active={editor?.isActive("heading", { level: 1 }) ?? false}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <Heading1 />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Heading 2"
          active={editor?.isActive("heading", { level: 2 }) ?? false}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolbarButton
          editor={editor}
          label="Bullet list"
          active={editor?.isActive("bulletList") ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Ordered list"
          active={editor?.isActive("orderedList") ?? false}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Quote"
          active={editor?.isActive("blockquote") ?? false}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Inline code"
          active={editor?.isActive("code") ?? false}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <Code />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Code block"
          active={editor?.isActive("codeBlock") ?? false}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <CodeXml />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Popover open={linkOpen} onOpenChange={handleLinkOpenChange}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Link"
                aria-pressed={editor?.isActive("link") ?? undefined}
                data-active={editor?.isActive("link") ? "" : undefined}
                disabled={!editor}
                className="data-[active]:bg-muted data-[active]:text-foreground"
              />
            }
          >
            <Link2 />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="space-y-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="tiptap-link-text">Text</FieldLabel>
                <Input
                  id="tiptap-link-text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={handleLinkKeyDown}
                  placeholder="Link text"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="tiptap-link-url">URL</FieldLabel>
                <Input
                  id="tiptap-link-url"
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={handleLinkKeyDown}
                  placeholder="https://example.com"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                {editor?.isActive("link") ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeLink}
                  >
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={!linkUrl.trim()}
                  onClick={handleLinkSubmit}
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {isVariableEnabled && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Insert variable"
                >
                  <Variable />
                  Variable
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {variables?.map((name) => (
                <DropdownMenuItem
                  key={name}
                  onClick={() => insertVariable(name)}
                >
                  <Variable className="text-muted-foreground" />
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Insert"
              >
                <Plus />
                Insert
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              disabled={!editor}
            >
              <ImageIcon className="text-muted-foreground" />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              disabled={!editor}
            >
              <Video className="text-muted-foreground" />
              Video
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && editor) handleFile(editor, file);
            e.target.value = "";
          }}
        />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolbarButton
          editor={editor}
          label="Undo"
          disabled={!editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Redo"
          disabled={!editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="tiptap-content" />
    </div>
  );
}
