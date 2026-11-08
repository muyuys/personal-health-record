// 通用弹层：复刻老版 js/app.modal.js 的 openModal/closeModal。
// 用法：在 React 树内用 <ModalProvider> 包裹，调用 useModal().openModal(node, cls)。
// 内部用 React state 渲染一个 .modal-root + .modal 容器（portal 到 document.body），
// 支持遮罩点击关闭、Esc 关闭、body overflow hidden；样式类名沿用老版。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface ModalCtx {
  openModal: (node: ReactNode, cls?: string) => void;
  closeModal: () => void;
}

const Ctx = createContext<ModalCtx | null>(null);

interface ModalState {
  node: ReactNode;
  cls: string;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState | null>(null);

  const openModal = useCallback((node: ReactNode, cls = '') => {
    setState({ node, cls });
  }, []);
  const closeModal = useCallback(() => setState(null), []);

  // body overflow hidden + Esc 关闭
  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [state]);

  const onOverlay = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setState(null);
  };

  return (
    <Ctx.Provider value={{ openModal, closeModal }}>
      {children}
      {state &&
        createPortal(
          <div className="modal-root" onClick={onOverlay}>
            <div
              className={'modal' + (state.cls ? ' ' + state.cls : '')}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {state.node}
            </div>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useModal(): ModalCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useModal must be inside ModalProvider');
  return c;
}
