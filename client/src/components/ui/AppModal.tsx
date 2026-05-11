import { CloseButton, Dialog, Flex, Portal, Text } from "@chakra-ui/react";

type AppModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Texto breve bajo el título (solo en cabecera). */
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "cover" | "full";
  /** Ancho máximo del panel (por defecto `min(100%, 440px)` para diálogos compactos). */
  contentMaxW?: string;
  /** Tamaño del título en cabecera (`lg` por defecto). */
  titleFontSize?: "lg" | "xl" | "2xl";
  /** Texto bajo el título (por defecto `sm`). */
  descriptionFontSize?: "sm" | "md";
  closeOnInteractOutside?: boolean;
};

export function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  contentMaxW = "min(100%, 440px)",
  titleFontSize = "lg",
  descriptionFontSize = "sm",
  closeOnInteractOutside = true,
}: AppModalProps) {
  return (
    <Dialog.Root
      open={open}
      size={size}
      closeOnInteractOutside={closeOnInteractOutside}
      onOpenChange={(details) => onOpenChange(details.open)}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner px={4} py={8}>
          <Dialog.Content
            borderRadius="xl"
            overflow="hidden"
            boxShadow="xl"
            borderWidth="1px"
            borderColor="gray.200"
            maxW={contentMaxW}
            w="100%"
            bg="white"
            display="flex"
            flexDirection="column"
          >
            <Dialog.Header
              px={6}
              pt={5}
              pb={description ? 3 : 4}
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg="green.50"
            >
              <Flex align="flex-start" gap={3}>
                <Flex direction="column" gap={1.5} flex="1" minW={0} pr={2}>
                  <Dialog.Title>
                    <Text
                      as="span"
                      fontSize={titleFontSize}
                      fontWeight="semibold"
                      color="gray.900"
                      letterSpacing="-0.02em"
                      lineHeight="short"
                    >
                      {title}
                    </Text>
                  </Dialog.Title>
                  {description ? (
                    <Text fontSize={descriptionFontSize} color="gray.600" lineHeight="tall">
                      {description}
                    </Text>
                  ) : null}
                </Flex>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" mt={-0.5} borderRadius="md" colorPalette="gray" aria-label="Cerrar" />
                </Dialog.CloseTrigger>
              </Flex>
            </Dialog.Header>
            <Dialog.Body px={6} py={6}>
              {children}
            </Dialog.Body>
            {footer ? (
              <Dialog.Footer
                px={6}
                py={4}
                borderTopWidth="1px"
                borderColor="gray.100"
                bg="gray.50"
                display="flex"
                justifyContent="flex-end"
                alignItems="center"
                gap={3}
                flexWrap="wrap"
                flexShrink={0}
                rowGap={3}
              >
                {footer}
              </Dialog.Footer>
            ) : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
