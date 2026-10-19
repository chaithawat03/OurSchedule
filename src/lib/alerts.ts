import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const confirmColor = '#245a76';
const cancelColor = '#6b7885';

/** Escaped plain text only: never pass Firestore fields or user input as HTML. */
export function showSuccess(message: string): void {
  void Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    text: message,
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
    showCloseButton: true,
    heightAuto: false,
  });
}

export function showError(message: string): void {
  void Swal.fire({
    icon: 'error',
    title: 'ไม่สามารถดำเนินการได้',
    text: message,
    confirmButtonText: 'ตกลง',
    confirmButtonColor: confirmColor,
    heightAuto: false,
  });
}

export async function confirmAction(options: {
  title: string;
  text?: string;
  confirmText?: string;
}): Promise<boolean> {
  const decision = await Swal.fire({
    title: options.title,
    text: options.text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? 'ยืนยัน',
    cancelButtonText: 'กลับ',
    confirmButtonColor: '#b04444',
    cancelButtonColor: cancelColor,
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: true,
    heightAuto: false,
  });
  return decision.isConfirmed;
}
