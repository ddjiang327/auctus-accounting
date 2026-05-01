import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ title, open, onClose, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-header">
          <button className="text-button" onClick={onClose}>Cancel</button>
          <h2>{title}</h2>
          <span className="header-spacer" />
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
