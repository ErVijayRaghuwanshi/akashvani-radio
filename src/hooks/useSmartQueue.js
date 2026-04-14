import { useMemo } from 'react'
import { usePersistentState } from './usePersistentState'

const PROFILE_VERSION = 1
const MAX_RECENTS = 30

const defaultProfile = {
  version: PROFILE_VERSION,
  playCounts: {},
  recentPlays: [],
  searchCounts: {},
  lastPlayedAt: {},
}

function uniquePush(list, value, max) {
  const without = list.filter((item) => item !== value)
  const next = [value, ...without]
  return next.slice(0, max)
}

export function useSmartQueue(stations) {
  const [profile, setProfile] = usePersistentState('akashvani-user-profile-v1', defaultProfile)

  const stationById = useMemo(() => {
    const map = new Map()
    for (const station of stations) map.set(station.id, station)
    return map
  }, [stations])

  const scoreById = useMemo(() => {
    const result = {}

    for (const station of stations) {
      const id = station.id
      const playCount = profile.playCounts[id] || 0
      const searchCount = profile.searchCounts[id] || 0
      const recencyRank = profile.recentPlays.indexOf(id)
      const recencyScore = recencyRank === -1 ? 0 : Math.max(0, MAX_RECENTS - recencyRank)
      const lastPlayedAt = profile.lastPlayedAt[id] || 0
      const freshness = lastPlayedAt > 0 ? 8 : 0

      result[id] = playCount * 3 + searchCount * 2 + recencyScore * 4 + freshness
    }

    return result
  }, [profile, stations])

  const smartList = useMemo(() => {
    return [...stations].sort((a, b) => (scoreById[b.id] || 0) - (scoreById[a.id] || 0))
  }, [stations, scoreById])

  const autoFavorites = useMemo(() => {
    return smartList.filter((station) => (scoreById[station.id] || 0) > 3).slice(0, 12)
  }, [smartList, scoreById])

  const trackPlay = (stationId, searchQuery) => {
    setProfile((prev) => {
      const next = {
        ...prev,
        version: PROFILE_VERSION,
        playCounts: {
          ...prev.playCounts,
          [stationId]: (prev.playCounts[stationId] || 0) + 1,
        },
        recentPlays: uniquePush(prev.recentPlays, stationId, MAX_RECENTS),
        lastPlayedAt: {
          ...prev.lastPlayedAt,
          [stationId]: Date.now(),
        },
      }

      if (searchQuery && searchQuery.trim()) {
        next.searchCounts = {
          ...prev.searchCounts,
          [stationId]: (prev.searchCounts[stationId] || 0) + 1,
        }
      }

      return next
    })
  }

  const getNeighbor = (currentId, direction) => {
    const ids = smartList.map((item) => item.id)
    if (!ids.length) return null

    const currentIndex = ids.indexOf(currentId)
    if (currentIndex < 0) return direction === 'next' ? smartList[0] : smartList[smartList.length - 1]

    const offset = direction === 'next' ? 1 : -1
    const nextIndex = (currentIndex + offset + ids.length) % ids.length
    return stationById.get(ids[nextIndex]) || null
  }

  return {
    smartList,
    autoFavorites,
    trackPlay,
    getNext: (currentId) => getNeighbor(currentId, 'next'),
    getPrev: (currentId) => getNeighbor(currentId, 'prev'),
    profile,
  }
}
