import { useShortlist, useShortlistMutations } from '../api/client'
import { useSaveUid } from '../App'
import { t } from '../lib/i18n'
import { toast } from '../lib/toast'
import { StarIcon } from './Icons'

/** Shortlist'e ekle/çıkar. Satır tıklamasını (drawer) tetiklemez. */
export function StarButton({ playerId, large }: { playerId: number; large?: boolean }) {
  const saveUid = useSaveUid()
  const shortlist = useShortlist(saveUid)
  const { add, remove } = useShortlistMutations(saveUid)
  const on = shortlist.data?.items.some(item => item.playerId === playerId) ?? false
  const error = add.error ?? remove.error ?? shortlist.error
  const label = on ? t('star.remove') : t('star.add')
  return (
    <span className="star-control">
    <button
      className={`star${on ? ' on' : ''}${large ? ' lg' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={error ? `İzleme listesi hatası: ${error.message}` : label}
      disabled={shortlist.isPending || shortlist.isError || add.isPending || remove.isPending}
      onClick={(e) => {
        e.stopPropagation()
        add.reset(); remove.reset()
        ;(on ? remove : add).mutate(playerId, { onSuccess: () => toast(on ? 'İzleme listesinden çıkarıldı' : 'İzleme listesine eklendi') })
      }}
    >
      <StarIcon filled={on} />
    </button>
    {error && <span className="star-error" role="alert" title={error.message}>Kaydedilemedi</span>}
    </span>
  )
}
