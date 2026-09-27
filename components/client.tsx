"use client";

import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Submit({ children, className = "btn-primary w-full", pendingText = "Please wait…", confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function PrintButton({ label = "Download / Print PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** Navigates to `?{param}=value` on change, preserving the path. */
export function SelectNav({ param, value, options, className = "input" }: { param: string; value: string; options: { value: string; label: string }[]; className?: string }) {
  const router = useRouter();
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        const url = new URL(window.location.href);
        url.searchParams.set(param, e.target.value);
        url.searchParams.delete("ok");
        url.searchParams.delete("err");
        router.push(url.pathname + url.search);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
