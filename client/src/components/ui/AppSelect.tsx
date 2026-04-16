import type { ComponentProps } from "react";
import { Field, NativeSelect, type FieldRootProps, type NativeSelectFieldProps } from "@chakra-ui/react";

type AppSelectProps = NativeSelectFieldProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  rootProps?: Omit<FieldRootProps, "invalid">;
  size?: ComponentProps<typeof NativeSelect.Root>["size"];
  disabled?: boolean;
};

export function AppSelect({ label, helperText, errorText, children, rootProps, size, disabled, ...fieldProps }: AppSelectProps) {
  return (
    <Field.Root invalid={Boolean(errorText)} {...rootProps}>
      {label ? <Field.Label>{label}</Field.Label> : null}
      <NativeSelect.Root size={size} disabled={disabled}>
        <NativeSelect.Field {...fieldProps}>
          {children}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      {helperText ? <Field.HelperText>{helperText}</Field.HelperText> : null}
      {errorText ? <Field.ErrorText>{errorText}</Field.ErrorText> : null}
    </Field.Root>
  );
}
