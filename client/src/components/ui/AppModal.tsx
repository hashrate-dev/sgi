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
  /** Dashboard oscuro estilo NiceHash (solo contenido / cabecera del modal). */
  variant?: "default" | "nicehash_watcher" | "emerald_panel";
  /** Clases extra en el panel del diálogo (p. ej. sombra o radio). */
  contentClassName?: string;
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
  variant = "default",
  contentClassName,
}: AppModalProps) {
  const nh = variant === "nicehash_watcher";
  const emerald = variant === "emerald_panel";
  return (
    <Dialog.Root
      open={open}
      size={size}
      closeOnInteractOutside={closeOnInteractOutside}
      onOpenChange={(details) => onOpenChange(details.open)}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner px={{ base: 3, md: 5 }} py={{ base: 4, md: 8 }}>
          <Dialog.Content
            borderRadius="2xl"
            overflow="hidden"
            boxShadow={emerald ? "0 25px 50px -12px rgba(15, 23, 42, 0.35)" : "xl"}
            borderWidth="1px"
            borderColor={nh ? "#30363d" : emerald ? "rgba(16, 185, 129, 0.28)" : "gray.200"}
            maxW={contentMaxW}
            w="100%"
            bg={nh ? "#0d1117" : emerald ? "#fafbfc" : "white"}
            display="flex"
            flexDirection="column"
            className={contentClassName}
          >
            <Dialog.Header
              px={{ base: 5, md: 8 }}
              pt={{ base: 4, md: 5 }}
              pb={description ? 3 : 4}
              borderBottomWidth="1px"
              borderColor={nh ? "#21262d" : emerald ? "rgba(16, 185, 129, 0.22)" : "gray.100"}
              bg={
                nh
                  ? "#161b22"
                  : emerald
                    ? "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 38%, #ffffff 100%)"
                    : "green.50"
              }
            >
              <Flex align="flex-start" gap={3}>
                <Flex direction="column" gap={1.5} flex="1" minW={0} pr={2}>
                  <Dialog.Title>
                    <Text
                      as="span"
                      fontSize={titleFontSize}
                      fontWeight="semibold"
                      color={nh ? "#f0f6fc" : emerald ? "#0f172a" : "gray.900"}
                      letterSpacing="-0.02em"
                      lineHeight="short"
                    >
                      {title}
                    </Text>
                  </Dialog.Title>
                  {description ? (
                    <Text
                      fontSize={descriptionFontSize}
                      color={nh ? "#8b949e" : emerald ? "rgba(21, 128, 61, 0.92)" : "gray.600"}
                      lineHeight="tall"
                    >
                      {description}
                    </Text>
                  ) : null}
                </Flex>
                <Dialog.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    mt={-0.5}
                    borderRadius="md"
                    colorPalette="gray"
                    aria-label="Cerrar"
                    color={nh ? "#c9d1d9" : emerald ? "gray.600" : undefined}
                    _hover={
                      nh
                        ? { bg: "whiteAlpha.200", color: "white" }
                        : emerald
                          ? { bg: "blackAlpha.100", color: "gray.900" }
                          : undefined
                    }
                  />
                </Dialog.CloseTrigger>
              </Flex>
            </Dialog.Header>
            <Dialog.Body
              px={nh ? 0 : emerald ? 0 : 6}
              py={nh ? 0 : emerald ? 0 : 6}
              bg={nh ? "#0d1117" : emerald ? "#f1f5f9" : undefined}
              flex={emerald ? "1" : undefined}
              minH={emerald ? "0" : undefined}
              display={emerald ? "flex" : undefined}
              flexDirection={emerald ? "column" : undefined}
            >
              {children}
            </Dialog.Body>
            {footer ? (
              <Dialog.Footer
                px={{ base: 5, md: 8 }}
                py={{ base: 4, md: 5 }}
                borderTopWidth="1px"
                borderColor={nh ? "#21262d" : emerald ? "rgba(148, 163, 184, 0.45)" : "gray.100"}
                bg={nh ? "#161b22" : emerald ? "#ffffff" : "gray.50"}
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
