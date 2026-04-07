import { useId, useState, type ChangeEvent } from "react";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

type Props = {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  /** Clases del input (ej. `form-control market-auth-panel__input`) */
  inputClassName?: string;
  /** Clases del label */
  labelClassName?: string;
};

/** Campo contraseña con toggle mostrar/ocultar (iconos Bootstrap Icons). */
export function MarketplacePasswordField({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
  required = false,
  inputClassName = "form-control",
  labelClassName = "form-label",
}: Props) {
  const { t } = useMarketplaceLang();
  const uid = useId().replace(/:/g, "");
  const fieldId = `market-pw-${uid}`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="mb-3">
      <label htmlFor={fieldId} className={labelClassName}>
        {label}
      </label>
      <div className="market-password-field">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          className={inputClassName}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          className="market-password-field__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("pwd.hide") : t("pwd.show")}
          aria-pressed={visible}
        >
          <i className={`bi ${visible ? "bi-eye-slash" : "bi-eye"}`} aria-hidden />
        </button>
      </div>
    </div>
  );
}
