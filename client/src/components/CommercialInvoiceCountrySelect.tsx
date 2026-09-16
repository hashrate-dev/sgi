import { useState } from "react";

type Props = {
  value: string;
  options: string[];
  disabled?: boolean;
  canAdd?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<string | null>;
};

export function CommercialInvoiceCountrySelect({
  value,
  options,
  disabled,
  canAdd,
  placeholder = "Seleccionar país…",
  onChange,
  onCreate,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setDraft("");
    setAdding(false);
  };

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await onCreate(draft);
      if (saved) {
        onChange(saved);
        cancel();
      }
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <input
        className="fact-input"
        autoFocus
        value={draft}
        disabled={disabled || saving}
        placeholder={saving ? "Guardando…" : "Nombre del país (Enter)"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (saving) return;
          if (draft.trim()) void commit();
          else cancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
      />
    );
  }

  return (
    <select
      className="fact-input fact-select"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "__add_country__") {
          setDraft("");
          setAdding(true);
          return;
        }
        onChange(next);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      {canAdd ? <option value="__add_country__">+ Agregar país…</option> : null}
    </select>
  );
}
