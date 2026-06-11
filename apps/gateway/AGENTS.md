<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Image Handling

- Always use `next/image` (`<Image />`) instead of the native HTML `<img>` tag.
- Import: `import Image from "next/image"`
- Use `unoptimized` prop for data URLs or external images without a configured image domain.
- Use `fill` with a parent container or explicit `width`/`height` props.

# Form Handling

- Inside `<form>`, wrap form controls with the shared Field primitives from `@/components/ui/field`.
- Use `FieldGroup` to group related fields, `Field` for each form item, `FieldLabel` instead of raw `<label>` or `Label`, `FieldError` for validation messages, and `FieldDescription` for helper text.
- Do not add new raw label/error wrapper markup inside forms unless there is a specific component-level reason.

# Table Handling

- For any table with an operation/action column, fix that column to the right side of the horizontally scrollable table.
- Apply the fixed-right behavior to both the header and body cells, for example: `className="sticky right-0 bg-background text-right shadow-[-1px_0_0_0_var(--border)]"`.
- Do not treat data fields named `action` as operation columns unless they contain row-level action controls such as edit, delete, view, configure, or permission buttons.
