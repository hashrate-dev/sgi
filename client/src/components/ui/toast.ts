import { showToast, type ToastType } from "../ToastNotification";

export function appToast(message: string, type: ToastType = "info", context?: string) {
  showToast(message, type, context);
}

export function appToastSuccess(message: string, context?: string) {
  showToast(message, "success", context);
}

export function appToastError(message: string, context?: string) {
  showToast(message, "error", context);
}
