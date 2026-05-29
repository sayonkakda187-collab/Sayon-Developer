"use client";

export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirmText = "Delete this permanently? This cannot be undone.",
  className = "text-sm font-medium text-red-700 hover:underline",
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label?: string;
  confirmText?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
