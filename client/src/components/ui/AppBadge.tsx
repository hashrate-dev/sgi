import { Badge, type BadgeProps } from "@chakra-ui/react";

export function AppBadge(props: BadgeProps) {
  return <Badge borderRadius="full" px={2.5} py={1} {...props} />;
}
