import { useId, type ReactNode } from "react";
import { Box, CloseButton, Dialog, Flex, Portal, Text } from "@chakra-ui/react";
import { AppButton } from "./ui";

type Variant = "info" | "warning" | "delete" | "success";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  /** Texto del recuadro rosa (ej. «Esta acción no se puede deshacer»). */
  warningText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
  /** Deshabilita botones y muestra spinner en confirmar (acciones async). */
  confirmPending?: boolean;
  confirmPendingLabel?: string;
  /** Por encima de capas altas (ej. drawer marketplace z-index ~10040). */
  elevated?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  info: "blue",
  warning: "orange",
  delete: "red",
  success: "green",
};

/** Icono de documento/PDF para confirmación de guardar */
function DocIcon() {
  return (
    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** Mismo icono que ClienteEdit / Usuarios (eliminar). */
function DeleteDangerIcon() {
  return (
    <svg className="professional-modal-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  warningText,
  confirmLabel = "Sí",
  cancelLabel = "No",
  variant = "info",
  onConfirm,
  onCancel,
  confirmPending = false,
  confirmPendingLabel = "Procesando…",
  elevated = false,
}: ConfirmModalProps) {
  const titleId = useId();

  const colorPalette = VARIANT_CLASS[variant];
  const confirmColorPalette = variant === "delete" ? "red" : variant === "warning" ? "orange" : "green";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onCancel();
      }}
      closeOnEscape={!confirmPending}
      closeOnInteractOutside={!confirmPending}
    >
      <Portal>
        <Dialog.Backdrop zIndex={elevated ? 1400 : undefined} bg="blackAlpha.600" />
        <Dialog.Positioner zIndex={elevated ? 1401 : undefined} px={4} py={8}>
          <Dialog.Content
            borderRadius="xl"
            overflow="hidden"
            boxShadow="xl"
            borderWidth="1px"
            borderColor="gray.200"
            maxW="min(100%, 520px)"
            bg="white"
            display="flex"
            flexDirection="column"
          >
            <Dialog.Header
              px={6}
              pt={5}
              pb={4}
              borderBottomWidth="1px"
              borderColor="gray.100"
              bg={`${colorPalette}.50`}
            >
              <Flex align="center" gap={3} w="100%">
                <Box w="28px" h="28px" color={`${colorPalette}.600`}>
                  {variant === "delete" ? <DeleteDangerIcon /> : <DocIcon />}
                </Box>
                <Dialog.Title id={titleId}>{title}</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    ml="auto"
                    mt={-0.5}
                    borderRadius="md"
                    colorPalette="gray"
                    disabled={confirmPending}
                    aria-label="Cerrar"
                  />
                </Dialog.CloseTrigger>
              </Flex>
            </Dialog.Header>
            <Dialog.Body px={6} py={6}>
              <Box fontSize="md" color="gray.700" mb={warningText ? 4 : 0}>
                {message}
              </Box>
              {warningText ? (
                <Box borderWidth="1px" borderColor={`${colorPalette}.300`} bg={`${colorPalette}.50`} borderRadius="md" p={3}>
                  <Text color={`${colorPalette}.800`} fontSize="sm" fontWeight="medium">
                    {warningText}
                  </Text>
                </Box>
              ) : null}
            </Dialog.Body>
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
              rowGap={3}
              flexShrink={0}
            >
              <AppButton variant="outline" onClick={onCancel} disabled={confirmPending} minH="42px" px={5}>
                {cancelLabel}
              </AppButton>
              <AppButton
                colorPalette={confirmColorPalette}
                onClick={onConfirm}
                disabled={confirmPending}
                loading={confirmPending}
                minH="42px"
                px={5}
              >
                {confirmPending ? confirmPendingLabel : confirmLabel}
              </AppButton>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
