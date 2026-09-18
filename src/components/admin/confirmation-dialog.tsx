'use client'

import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

export function ConfirmationDialog({
  busy = false,
  confirmationText,
  description,
  error,
  itemLabel,
  onCancel,
  onConfirm,
  title,
}: {
  busy?: boolean
  confirmationText: string
  description: string
  error?: string
  itemLabel: string
  onCancel: () => void
  onConfirm: () => void
  title: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const matches = value === confirmationText

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [busy, onCancel])

  return (
    <div className="confirm-overlay" role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="关闭删除确认"
          className="confirm-dialog-close"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X />
        </button>
        <div className="confirm-dialog-icon" aria-hidden="true"><AlertTriangle /></div>
        <p className="eyebrow">DESTRUCTIVE ACTION</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-item">
          <span>即将删除</span>
          <strong>{itemLabel}</strong>
        </div>
        <label htmlFor={`${titleId}-confirmation`}>
          <span>输入文章标题以确认</span>
          <code>{confirmationText}</code>
          <input
            aria-label="输入文章标题以确认"
            autoComplete="off"
            id={`${titleId}-confirmation`}
            onChange={(event) => setValue(event.target.value)}
            ref={inputRef}
            value={value}
          />
        </label>
        {error ? <p className="confirm-dialog-error" role="alert">{error}</p> : null}
        <footer>
          <button disabled={busy} onClick={onCancel} type="button">取消</button>
          <button disabled={!matches || busy} onClick={onConfirm} type="button">
            {busy ? <><LoaderCircle className="spin" />正在删除</> : <><Trash2 />永久删除</>}
          </button>
        </footer>
      </div>
    </div>
  )
}
