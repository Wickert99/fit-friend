/** True when a pointer event landed outside the dialog box (on the backdrop). */
export function pointerOutside(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, x: number, y: number): boolean {
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
}

export function dialogClosedBySupported(): boolean {
  return typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype
}
