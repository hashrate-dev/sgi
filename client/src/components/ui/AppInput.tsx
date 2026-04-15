import { Field, Input, type FieldRootProps, type InputProps } from "@chakra-ui/react";

type AppInputProps = InputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  rootProps?: Omit<FieldRootProps, "invalid">;
};

export function AppInput({ label, helperText, errorText, rootProps, ...inputProps }: AppInputProps) {
  return (
    <Field.Root invalid={Boolean(errorText)} gap={2} {...rootProps}>
      {label ? (
        <Field.Label fontWeight="medium" fontSize="sm" color="gray.700" mb={0}>
          {label}
        </Field.Label>
      ) : null}
      <Input size="md" borderRadius="md" borderColor="gray.200" {...inputProps} />
      {helperText ? <Field.HelperText fontSize="xs">{helperText}</Field.HelperText> : null}
      {errorText ? <Field.ErrorText fontSize="sm">{errorText}</Field.ErrorText> : null}
    </Field.Root>
  );
}
