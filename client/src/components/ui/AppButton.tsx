import { Button, type ButtonProps } from "@chakra-ui/react";

export function AppButton(props: ButtonProps) {
  return <Button size="sm" colorPalette="green" borderRadius="md" {...props} />;
}
