import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClubView, FeedResponse, TeamsView, FilterOptions, Health, HistoryPoint, MarketPlayer, PagedPlayers, PlayerDetail, SaveInfo, ShortlistItem,
  ShortlistView, SyncInfo,
  RegenReport,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

type Params = Record<string, string | undefined>

function url(path: string, params?: Params) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== '') qs.set(k, v)
  return qs.size ? `${path}?${qs}` : path
}

export async function get<T>(path: string, params?: Params): Promise<T> {
  return read<T>(await fetch(url(path, params)))
}

/** Yazan istekler (yalnızca app.db: shortlist, teknik direktör profili). 204 için null döner. */
export async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, params?: Params, body?: unknown): Promise<T | null> {
  const res = await fetch(url(path, params), {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.status === 204 ? null : read<T>(res)
}

async function read<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = body.title ?? body.detail ?? msg
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json()
}

/** Yeni snapshot geldi mi diye 10 sn'de bir sorulur (izleyici kaydı ~10 sn'de içe aktarır). */
export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => get<Health>('/api/health'), refetchInterval: 10_000 })

/** Kariyer listesi (tarih, dal): yeni kayıt/export gelince üst çubuk ve kariyer seçimi de güncel kalsın. */
export const useSaves = () => useQuery({ queryKey: ['saves'], queryFn: () => get<SaveInfo[]>('/api/saves'), refetchInterval: 15_000 })

export const useSync = (saveUid?: string) => useQuery({
  queryKey: ['sync', saveUid], queryFn: () => get<SyncInfo>('/api/sync', { saveUid }), refetchInterval: 10_000,
})

/** Kullanıcı takımının (teamId verilmezse) kulüp görünümü: kadro, ilk 11, lig tablosu. */
export const useClub = (saveUid?: string, teamId?: number, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['club', saveUid, teamId],
    queryFn: () => get<ClubView>('/api/club', { saveUid, teamId: teamId?.toString() }),
    staleTime: 60_000,
  })

/** Takım veritabanı (Scout → Takımlar). */
export const useTeams = (saveUid?: string) =>
  useQuery({ queryKey: ['teams', saveUid], queryFn: () => get<TeamsView>('/api/teams', { saveUid }), staleTime: 60_000 })

/** Tek sayfa oyuncu listesi (kartlar ve kısa listeler için; büyük tablo usePlayerRows kullanır). */
export const usePlayerPage = (params: Params, saveUid?: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['playerPage', saveUid, params],
    queryFn: () => get<PagedPlayers>('/api/players', { ...params, saveUid }),
    staleTime: 60_000,
  })

export const useFilterOptions = (saveUid?: string) =>
  useQuery({
    queryKey: ['filterOptions', saveUid],
    queryFn: () => get<FilterOptions>('/api/filters/options', { saveUid }),
    staleTime: Infinity,
  })

export const usePlayerDetail = (id: number | null, saveUid?: string) =>
  useQuery({
    queryKey: ['player', saveUid, id],
    queryFn: () => get<PlayerDetail>(`/api/players/${id}`, { saveUid }),
    enabled: id !== null,
    staleTime: Infinity,
  })

export const useRegens = (saveUid?: string) =>
  useQuery({ queryKey: ['regens', saveUid], queryFn: () => get<RegenReport>('/api/regens', { saveUid }), staleTime: 60_000 })

export const usePlayerHistory = (id: number | null, saveUid?: string) =>
  useQuery({
    queryKey: ['history', saveUid, id],
    queryFn: () => get<HistoryPoint[]>(`/api/players/${id}/history`, { saveUid }),
    enabled: id !== null,
    staleTime: Infinity,
  })

export const PAGE_SIZE = 100

/**
 * Sunucu tarafı sayfalanmış satırlar + sanal kaydırma: sadece görünen aralığın sayfaları çekilir.
 * 1. sayfa toplam sayıyı verir; diğerleri kaydırdıkça gelir. Satır yüklenmemişse undefined döner.
 */
export function usePlayerRows(params: Record<string, string>, saveUid: string | undefined, visible: [number, number]) {
  const key = JSON.stringify(params)
  const fetchPage = (page: number) =>
    get<PagedPlayers>('/api/players', { ...params, saveUid, page: String(page), pageSize: String(PAGE_SIZE) })

  const first = useQuery({
    queryKey: ['players', saveUid, key, 1],
    queryFn: () => fetchPage(1),
    staleTime: Infinity,
  })

  const total = first.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pages: number[] = []
  const from = Math.floor(visible[0] / PAGE_SIZE) + 1
  const to = Math.min(lastPage, Math.floor(visible[1] / PAGE_SIZE) + 1)
  for (let p = Math.max(2, from); p <= to; p++) pages.push(p)

  const rest = useQueries({
    queries: pages.map((p) => ({
      queryKey: ['players', saveUid, key, p, first.data?.snapshot.snapshotId],
      queryFn: () => fetchPage(p),
      staleTime: Infinity,
      enabled: !first.isPlaceholderData && first.isSuccess,
    })),
  })

  const byPage = new Map<number, MarketPlayer[]>()
  if (first.data && !first.isPlaceholderData) byPage.set(1, first.data.items)
  pages.forEach((p, i) => {
    const data = rest[i]?.data
    if (data?.snapshot.snapshotId === first.data?.snapshot.snapshotId && data) byPage.set(p, data.items)
  })

  const mismatched = rest.some(q => q.data && q.data.snapshot.snapshotId !== first.data?.snapshot.snapshotId)

  const getRow = (index: number): MarketPlayer | undefined =>
    first.isPlaceholderData && index < PAGE_SIZE
      ? first.data?.items[index] // filtre değişirken eski ilk sayfayı göster
      : byPage.get(Math.floor(index / PAGE_SIZE) + 1)?.[index % PAGE_SIZE]

  return {
    total,
    snapshot: first.data?.snapshot,
    getRow,
    isLoading: first.isLoading,
    isPlaceholderData: first.isPlaceholderData,
    isFetching: first.isFetching,
    error: (first.error ?? rest.find(q => q.error)?.error ?? (mismatched ? new Error('Yeni snapshot algılandı. Listeyi yenileyin.') : null)) as Error | null,
    refetch: () => { void first.refetch(); rest.forEach(q => { void q.refetch() }) },
  }
}

// --- Shortlist ---------------------------------------------------------------

export const useShortlist = (saveUid?: string) =>
  useQuery({ queryKey: ['shortlist', saveUid], queryFn: () => get<ShortlistView>('/api/shortlist', { saveUid }) })

/** Yıldızlar için: shortlist'teki oyuncu id'leri. */
export function useShortlistIds(saveUid?: string): Set<number> {
  const { data } = useShortlist(saveUid)
  return useMemo(() => new Set(data?.items.map((i) => i.playerId)), [data])
}

export interface ShortlistEdit {
  note: string | null
  tags: string[]
  targetPrice: number | null
}

export function useShortlistMutations(saveUid?: string) {
  const qc = useQueryClient()
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: ['shortlist'] })
    qc.invalidateQueries({ queryKey: ['feed'] })
  }
  return {
    add: useMutation({ mutationFn: (id: number) => send<ShortlistItem>('POST', `/api/shortlist/${id}`, { saveUid }), onSuccess }),
    remove: useMutation({ mutationFn: (id: number) => send<null>('DELETE', `/api/shortlist/${id}`, { saveUid }), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, edit }: { id: number; edit: ShortlistEdit }) =>
        send<ShortlistItem>('PUT', `/api/shortlist/${id}`, { saveUid }, edit),
      onSuccess,
    }),
  }
}

// --- Haber akışı -------------------------------------------------------------

export const useFeed = (params: Params, saveUid?: string) =>
  useQuery({
    queryKey: ['feed', saveUid, params],
    queryFn: () => get<FeedResponse>('/api/feed', { ...params, saveUid }),
    placeholderData: keepPreviousData,
  })
