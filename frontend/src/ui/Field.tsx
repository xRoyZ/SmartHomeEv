import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cx } from "./Button";
import { Icon } from "./Icon";

export interface FieldProps {
  /** Visible label (`.label`), bound to the control by `htmlFor`. */
  label: ReactNode;
  /** Id of the control inside the field. */
  htmlFor: string;
  /** Validation message; pass it only once the field was touched or submitted. */
  error?: ReactNode;
  /** Id of the error line, so the control can name it in aria-describedby. */
  errorId?: string;
  className?: string;
  children: ReactNode;
}

/** The id of a field's error line. */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

/**
 * The design's `.field`: label, control and the `.field-error` line
 * (design/mockups/automationen.html "rule-name").
 */
export function Field({ label, htmlFor, error, errorId, className, children }: FieldProps) {
  return (
    <div className={cx("field", className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error !== undefined && error !== null && error !== false && (
        <p className="field-error" id={errorId ?? fieldErrorId(htmlFor)} role="alert">
          <Icon name="circle-alert" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the input invalid (red border) and links its error line. */
  invalid?: boolean;
}

/** The design's `.input`. */
export function Input({ invalid = false, className, id, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      id={id}
      className={cx("input", className)}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? fieldErrorId(id) : rest["aria-describedby"]}
    />
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** The design's `.select`: a native select with the chevron. */
export function Select<T extends string = string>({ options, value, onChange, className, ...rest }: SelectProps<T>) {
  return (
    <div className={cx("select", className)}>
      <select {...rest} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" />
    </div>
  );
}

export interface EditorLineProps {
  /** 3 = sensor/op/value line, 2 = device/action line (editor-line--2). */
  cols?: 2 | 3;
  className?: string;
  children: ReactNode;
}

/** The design's `.editor-line`: the field row of the rule editor. */
export function EditorLine({ cols = 3, className, children }: EditorLineProps) {
  return <div className={cx("editor-line", cols === 2 && "editor-line--2", className)}>{children}</div>;
}

/** The design's `.input-unit`: a value input with its unit next to it. */
export function InputUnit({ children }: { children: ReactNode }) {
  return <div className="input-unit">{children}</div>;
}

export default Field;
