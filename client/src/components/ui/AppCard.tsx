import { Box, type BoxProps } from "@chakra-ui/react";

export function AppCard(props: BoxProps) {
  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      boxShadow="sm"
      p={4}
      {...props}
    />
  );
}
