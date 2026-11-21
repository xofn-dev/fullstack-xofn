// Sorotan yang mengikuti pointer di kartu/panel: hanya menulis dua CSS variable, paling banyak
// sekali per frame. Pola yang sama dengan kartu landing (landing-motion), dibuat generik.
export function attachSpotlight(root: HTMLElement, selector: string): () => void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};
  let frame = 0;
  let pending: PointerEvent | null = null;
  const apply = () => {
    frame = 0;
    const event = pending;
    pending = null;
    if (!event || !(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>(selector);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spotX', `${event.clientX - rect.left}px`);
    card.style.setProperty('--spotY', `${event.clientY - rect.top}px`);
  };
  const onMove = (event: PointerEvent) => {
    pending = event;
    if (!frame) frame = requestAnimationFrame(apply);
  };
  root.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    root.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
  };
}
