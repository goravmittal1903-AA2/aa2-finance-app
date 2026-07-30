'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/** Refreshes a screen when Supabase broadcasts a relevant database change. */
export function useRealtimeInvalidation(table: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`aa2-${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [onChange, table])
}
