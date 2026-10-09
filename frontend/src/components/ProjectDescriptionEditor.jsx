import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { uploadDescriptionImage } from '../services/projects';
import { startVerticalResize } from '../utils/verticalResize';

// Batas tinggi editor yang bisa di-resize (px).
const MIN_EDITOR_HEIGHT = 200;
const MAX_EDITOR_HEIGHT = 800;
const DEFAULT_EDITOR_HEIGHT = 200;

// WYSIWYG deskripsi projek (Tiptap, open-source/MIT).
// Menyimpan HTML; gambar di-upload ke backend (URL absolut di <img>),
// TIDAK PERNAH base64. Mendukung: bold/italic/underline/strike,
// heading 1-3, bullet/numbered list, alignment, link, image
// (toolbar + paste + drag-and-drop).
// Fitur: resize vertikal dengan handle di bagian bawah editor.
export default function ProjectDescriptionEditor({ value, onChange, error, uploadingNotice }) {
  const [uploading, setUploading] = useState(false);
  const [editorHeight, setEditorHeight] = useState(DEFAULT_EDITOR_HEIGHT); // Tinggi awal nyaman (px)
  const [isResizing, setIsResizing] = useState(false);
  const fileRef = useRef(null);
  const editorWrapperRef = useRef(null);
  const contentRef = useRef(null);

  // Ref selalu menunjuk callback/instance terbaru; penugasan HANYA di
  // dalam effect supaya tidak ada akses ref saat render.
  const onChangeRef = useRef(onChange);
  const uploadRef = useRef(null);
  const editorRef = useRef(null);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const uploadAndInsert = useCallback(
    async (file, editor) => {
      if (!file || !file.type.startsWith('image/')) return false;
      setUploading(true);
      try {
        const res = await uploadDescriptionImage(file);
        const url = res?.data?.url;
        if (!url) throw new Error('URL gambar tidak ditemukan.');
        editor
          .chain()
          .focus()
          .setImage({ src: url })
          .run();
        return true;
      } catch (err) {
        uploadingNotice?.(err.message || 'Gagal mengunggah gambar.');
        return false;
      } finally {
        setUploading(false);
      }
    },
    [uploadingNotice]
  );
  useEffect(() => {
    uploadRef.current = uploadAndInsert;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value || '',
    editorProps: {
      attributes: { class: 'rte-content' },
      // Paste gambar -> upload, bukan base64.
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) {
            event.preventDefault();
            uploadRef.current?.(file, editorRef.current);
            return true;
          }
        }
        return false;
      },
      // Drop gambar -> upload.
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = [...files].find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        uploadRef.current?.(file, editorRef.current);
        return true;
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current?.(editor.getHTML());
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  });

  // Sinkron nilai luar (mis. prefill edit) tanpa merusak caret saat mengetik.
  const lastExternal = useRef(value || '');
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if ((value || '') !== lastExternal.current && (value || '') !== editor.getHTML()) {
      lastExternal.current = value || '';
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  // Handle resize mouse events.
  // Listener dipasang di `document` (oleh helper) supaya drag tidak terputus
  // walau pointer keluar dari handle. Tinggi awal + callback diberikan sebagai
  // argumen sehingga tidak ada closure state yang basi.
  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return; // hanya klik kiri
      e.preventDefault();
      e.stopPropagation();

      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      setIsResizing(true);

      startVerticalResize({
        doc: document,
        startClientY: e.clientY,
        startHeight: editorHeight,
        minHeight: MIN_EDITOR_HEIGHT,
        maxHeight: MAX_EDITOR_HEIGHT,
        onResize: setEditorHeight,
        onEnd: () => {
          setIsResizing(false);
          document.body.style.userSelect = previousUserSelect;
        },
      });
    },
    [editorHeight]
  );

  if (!editor) return null;

  const btn = (active) =>
    cn(
      'p-1.5 rounded-lg transition-colors',
      active
        ? 'bg-primary-100 text-primary-700'
        : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
    );

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL tautan:', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div ref={editorWrapperRef}>
      <span className="block text-sm font-medium text-text-primary mb-1.5">Deskripsi</span>
      <div
        className={cn(
          'rounded-lg border border-border bg-white overflow-hidden transition-all duration-200 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500',
          error && 'border-error focus-within:ring-error focus-within:border-error'
        )}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-gray-50/60">
          <button type="button" title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
            <Italic className="w-4 h-4" />
          </button>
          <button type="button" title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))}>
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button type="button" title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
            <Strikethrough className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button type="button" title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}>
            <Heading1 className="w-4 h-4" />
          </button>
          <button type="button" title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>
            <Heading2 className="w-4 h-4" />
          </button>
          <button type="button" title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))}>
            <Heading3 className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button type="button" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
            <List className="w-4 h-4" />
          </button>
          <button type="button" title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
            <ListOrdered className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button type="button" title="Rata kiri" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))}>
            <AlignLeft className="w-4 h-4" />
          </button>
          <button type="button" title="Rata tengah" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))}>
            <AlignCenter className="w-4 h-4" />
          </button>
          <button type="button" title="Rata kanan" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))}>
            <AlignRight className="w-4 h-4" />
          </button>
          <button type="button" title="Rata kanan-kiri" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btn(editor.isActive({ textAlign: 'justify' }))}>
            <AlignJustify className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border mx-1" />
          <button type="button" title="Tautan" onClick={setLink} className={btn(editor.isActive('link'))}>
            <LinkIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Sisipkan gambar (di-upload ke server)"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className={cn(btn(false), uploading && 'opacity-50 pointer-events-none')}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) uploadAndInsert(file, editor);
            }}
          />
        </div>
        {/* Area tulis - wrapper yang bisa di-resize */}
        <div
          ref={contentRef}
          className="relative"
          style={{ height: `${editorHeight}px` }}
        >
          {/*
            EditorContent merender <div> pembungkus di luar elemen
            contenteditable .rte-content. Tanpa tinggi eksplisit pada
            pembungkus ini, `height: 100%` di .rte-content tidak bisa
            dihitung (parent auto-height), sehingga area tulis tidak ikut
            meluas. `h-full` membuat rantai tinggi terhubung ke wrapper.
          */}
          <EditorContent editor={editor} className="h-full" />
        </div>
        {/* Resize handle */}
        <div
          className={cn(
            'h-2.5 cursor-ns-resize flex items-center justify-center bg-gray-50/50 border-t border-border transition-colors select-none',
            isResizing && 'bg-primary-100 border-primary-200',
            'hover:bg-gray-100'
          )}
          onMouseDown={handleMouseDown}
          aria-label="Ubah tinggi editor"
          role="separator"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setEditorHeight((h) => Math.max(MIN_EDITOR_HEIGHT, h - 20));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setEditorHeight((h) => Math.min(MAX_EDITOR_HEIGHT, h + 20));
            }
          }}
        >
          <GripVertical className="w-8 h-1 text-text-muted" />
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  );
}