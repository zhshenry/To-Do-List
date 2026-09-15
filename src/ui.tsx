import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X } from '@phosphor-icons/react';
export function IconButton({ label, children, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick} {...props}>{children}</button>;
}
export function Modal({ title, children, close, dirty = false }: { title: string; children: ReactNode; close(): void; dirty?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const discard = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current!; element.showModal(); return () => element.close(); }, []);
  function requestClose() { if (dirty) discard.current?.showModal(); else close(); }
  return <>
    <dialog ref={ref} className="modal" aria-label={title} onCancel={event => { event.preventDefault(); requestClose(); }}>
      <header className="modal-heading"><h2>{title}</h2><IconButton label="关闭" onClick={requestClose}><X size={20} /></IconButton></header>
      {children}
    </dialog>
    <dialog ref={discard} className="modal confirm" aria-label="放弃未保存的修改" onCancel={() => discard.current?.close()}>
      <h2>放弃未保存的修改？</h2><p>已填写的内容尚未保存。</p>
      <div className="actions"><button autoFocus onClick={() => discard.current?.close()}>继续编辑</button><button className="danger" onClick={close}>放弃修改</button></div>
    </dialog>
  </>;
}
export function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : '操作未完成，请重试').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
export function timeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '待定';
}
export function dateTimeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未设置';
}
