'use client'

import { useCallback, useEffect, useState } from 'react'

interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  error?: string
}

export function usePaginatedResource<T>(resource: string, query: string, pageSize = 50) {
  const [data, setData] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (query.trim()) params.set('q', query.trim())
      const response = await fetch(`/api/records/${resource}?${params}`, { signal })
      const result = await response.json() as PaginatedResponse<T>
      if (!response.ok) throw new Error(result.error || 'Could not load records.')
      setData(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Could not load records.')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, query, resource])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(controller.signal), 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [load, refreshVersion])

  const refresh = useCallback(() => setRefreshVersion(version => version + 1), [])

  return {
    data, page, setPage, total, totalPages, loading, error,
    resetToFirstPage: () => setPage(1),
    refresh,
  }
}
