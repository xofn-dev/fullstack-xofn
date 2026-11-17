'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { lockScroll } from '@/lib/client/lenis';

export interface ModalContent {
  title: string;
  copy: string;
  /** Rincian mono; baris baru ditampilkan apa adanya. */
  detail: string;
  eyebrow?: string;
}

interface OverlayApi {
  openModal: (content: ModalContent) => void;
  closeModal: () => void;
  toast: (message: string) => void;
}

const OverlayContext = createContext<OverlayApi | null>(null);

export function useOverlay(): OverlayApi {
  const api = useContext(OverlayContext);
  if (!api) throw new Error('useOverlay harus dipakai di dalam <OverlayProvider>.');
  return api;
}

const TOAST_MS = 4200;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Menjebak fokus di dalam dialog selama terbuka, menutup dengan Escape,
 * dan mengembalikan fokus ke pemicu saat ditutup (DESIGN_SYSTEM §5.11).
 */
export function useDialogFocus(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = lockScroll();
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail?.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      release();
      previous?.focus();
    };
  }, [open, containerRef, onClose]);
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalContent | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const closeModal = useCallback(() => setModal(null), []);
  const openModal = useCallback((content: ModalContent) => setModal(content), []);
  const toast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  useDialogFocus(modal !== null, modalRef, closeModal);

  const api = useMemo<OverlayApi>(
    () => ({ openModal, closeModal, toast }),
    [openModal, closeModal, toast],
  );

  return (
    <OverlayContext.Provider value={api}>
      {children}
      <div className={cn('toast', toastVisible && 'show')} role="status" aria-live="polite">
        {toastMessage}
      </div>
      <div
        className={cn('overlay', modal && 'open')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalTitle"
        aria-hidden={modal ? undefined : true}
        data-lenis-prevent=""
        onClick={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}
      >
        <div className="modal" ref={modalRef}>
          <button className="close" type="button" aria-label="Close" onClick={closeModal}>
            ✕
          </button>
          <div className="eyebrow">{modal?.eyebrow ?? 'XOFN / PROTOCOL PREVIEW'}</div>
          <h3 id="modalTitle">{modal?.title ?? ''}</h3>
          <p>{modal?.copy ?? ''}</p>
          <div className="detail">{modal?.detail ?? ''}</div>
          <button
            className="btn primary"
            type="button"
            style={{ width: '100%' }}
            onClick={closeModal}
          >
            Understood <span className="arr">↗</span>
          </button>
        </div>
      </div>
    </OverlayContext.Provider>
  );
}
