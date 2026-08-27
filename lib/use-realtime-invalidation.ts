'use client'

import { useEffect } from 'react'

/** Refreshes a screen when database changes occur. */
export function useRealtimeInvalidation(table: string, onChange: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail || !detail.stores || detail.stores.includes(table) || detail.store === table) {
        onChange()
      }
    }

    window.addEventListener('aa2_data_changed', handler)
    return () => {
      window.removeEventListener('aa2_data_changed', handler)
    }
  }, [onChange, table])
}
