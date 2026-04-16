import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Pause,
  PictureInPicture,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react'
import { RADIO_STATIONS } from './data/stations'
import { useRadioPlayer } from './hooks/useRadioPlayer'
import { useSmartQueue } from './hooks/useSmartQueue'

const getHashQueryParams = (hash) => new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')

const getStationIdFromLocation = () => {
  if (typeof window === 'undefined') return ''

  const hash = window.location.hash || ''
  const hashMatch = hash.match(/^#\/station\/([^/?#]+)/i)
  if (hashMatch?.[1]) {
    return decodeURIComponent(hashMatch[1])
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('station') || getHashQueryParams(hash).get('station') || ''
}

const shouldAutoplayFromLocation = () => {
  if (typeof window === 'undefined') return false

  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = getHashQueryParams(window.location.hash || '')
  const raw = (hashParams.get('autoplay') || searchParams.get('autoplay') || '').toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

const getStationFromLocation = () => {
  const stationId = getStationIdFromLocation()
  if (!stationId) return RADIO_STATIONS[0]

  return RADIO_STATIONS.find((station) => String(station.id) === stationId) || RADIO_STATIONS[0]
}

function App() {
  const [currentStation, setCurrentStation] = useState(() => getStationFromLocation())
  const [searchQuery, setSearchQuery] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installState, setInstallState] = useState('')
  const [showMobileVolume, setShowMobileVolume] = useState(false)
  const canvasRef = useRef(null)
  const animationRef = useRef(null)

  const {
    audioRef,
    videoRef,
    pipCanvasRef,
    analyserRef,
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    isLoading,
    error,
    togglePlay,
    supportsPiP,
    togglePiP,
  } = useRadioPlayer(currentStation)

  const { smartList, autoFavorites, trackPlay, getNext, getPrev, profile } = useSmartQueue(RADIO_STATIONS)

  const groupedStations = useMemo(() => {
    const source = RADIO_STATIONS.filter((station) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        station.name.toLowerCase().includes(query) ||
        station.state.toLowerCase().includes(query) ||
        station.language.toLowerCase().includes(query)
      )
    })

    return source.reduce((acc, station) => {
      if (!acc[station.state]) acc[station.state] = []
      acc[station.state].push(station)
      return acc
    }, {})
  }, [searchQuery])

  const selectStation = useCallback((station) => {
    setCurrentStation(station)
    setIsPlaying(true)
    trackPlay(station.id, searchQuery)
  }, [searchQuery, setIsPlaying, trackPlay])

  const playNext = useCallback(() => {
    const next = getNext(currentStation.id)
    if (!next) return
    selectStation(next)
  }, [currentStation.id, getNext, selectStation])

  const playPrev = useCallback(() => {
    const prev = getPrev(currentStation.id)
    if (!prev) return
    selectStation(prev)
  }, [currentStation.id, getPrev, selectStation])

  useEffect(() => {
    const syncStationFromLocation = () => {
      const nextStation = getStationFromLocation()
      if (nextStation.id !== currentStation.id) {
        setCurrentStation(nextStation)
      }

      if (shouldAutoplayFromLocation()) {
        setIsPlaying(true)
      }
    }

    syncStationFromLocation()
    window.addEventListener('hashchange', syncStationFromLocation)

    return () => {
      window.removeEventListener('hashchange', syncStationFromLocation)
    }
  }, [currentStation.id, setIsPlaying])

  useEffect(() => {
    if (typeof window === 'undefined' || !currentStation?.id) return

    const hashParams = getHashQueryParams(window.location.hash || '')
    const autoplayParam = hashParams.get('autoplay')
    const nextHash = autoplayParam
      ? `#/station/${encodeURIComponent(currentStation.id)}?autoplay=${encodeURIComponent(autoplayParam)}`
      : `#/station/${encodeURIComponent(currentStation.id)}`

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
    }
  }, [currentStation])

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentStation.name,
      artist: `${currentStation.state} • ${currentStation.language}`,
      album: 'Akashvani Radio',
      artwork: [
        { src: currentStation.image, sizes: '96x96', type: 'image/jpeg' },
        { src: currentStation.image, sizes: '192x192', type: 'image/jpeg' },
      ],
    })

    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack', playNext)
    navigator.mediaSession.setActionHandler('previoustrack', playPrev)
  }, [currentStation, playNext, playPrev, setIsPlaying])

  useEffect(() => {
    const draw = () => {
      if (!canvasRef.current || !pipCanvasRef.current) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const pipCanvas = pipCanvasRef.current
      const pipCtx = pipCanvas.getContext('2d')

      if (canvas.width !== canvas.offsetWidth) canvas.width = canvas.offsetWidth
      if (canvas.height !== canvas.offsetHeight) canvas.height = canvas.offsetHeight

      const width = canvas.width
      const height = canvas.height
      const pipWidth = pipCanvas.width
      const pipHeight = pipCanvas.height
      const numBars = 64
      const barWidth = width / numBars
      const pipBarWidth = pipWidth / numBars
      const spectrumGain = 1.0
      const noiseFloor = 0.02
      const hueShift = (Date.now() / 25) % 360
      const analyser = analyserRef.current
      const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray)
      }

      ctx.clearRect(0, 0, width, height)
      pipCtx.fillStyle = '#020617'
      pipCtx.fillRect(0, 0, pipWidth, pipHeight)
      pipCtx.fillStyle = '#f8fafc'
      pipCtx.font = 'bold 30px sans-serif'
      pipCtx.textAlign = 'center'
      pipCtx.fillText(currentStation.name, pipWidth / 2, pipHeight / 2 - 18)
      pipCtx.fillStyle = '#cbd5e1'
      pipCtx.font = '20px sans-serif'
      pipCtx.fillText(`${currentStation.state} • ${currentStation.language}`, pipWidth / 2, pipHeight / 2 + 20)

      const getLogBinLevel = (binIndex) => {
        if (!dataArray || !dataArray.length) return 0

        const minBin = 1
        const maxBin = dataArray.length - 1
        const minLog = Math.log(minBin)
        const maxLog = Math.log(maxBin)

        const start = Math.floor(
          Math.exp(minLog + ((maxLog - minLog) * binIndex) / numBars),
        )
        const end = Math.floor(
          Math.exp(minLog + ((maxLog - minLog) * (binIndex + 1)) / numBars),
        )

        const safeStart = Math.max(0, Math.min(start, dataArray.length - 1))
        const safeEnd = Math.max(safeStart + 1, Math.min(end, dataArray.length))

        let total = 0
        for (let i = safeStart; i < safeEnd; i += 1) {
          total += dataArray[i]
        }

        const avg = total / (safeEnd - safeStart)
        return avg / 255
      }

      for (let i = 0; i < numBars; i += 1) {
        const hasRealSignal = Boolean(isPlaying && dataArray && dataArray.length)
        const fallbackWave =
          0.22 +
          0.16 * Math.sin(Date.now() / 220 + i * 0.55) +
          0.08 * Math.sin(Date.now() / 95 + i * 0.18)
        const rawLevel = hasRealSignal ? getLogBinLevel(i) : isPlaying ? Math.max(0.04, fallbackWave) : 0
        const leveled = Math.max(0, rawLevel - noiseFloor)
        const normalized = Math.min(1, leveled * spectrumGain)

        const barHeight = normalized * height * 0.8
        const pipBarHeight = normalized * pipHeight * 0.45
        const hue = (hueShift + i * 7) % 360

        const x = i * barWidth
        const pipX = i * pipBarWidth

        ctx.fillStyle = `hsla(${hue}, 85%, 62%, 0.34)`
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight)

        pipCtx.fillStyle = `hsla(${hue}, 85%, 62%, 0.58)`
        pipCtx.fillRect(pipX, pipHeight - pipBarHeight, pipBarWidth - 1, pipBarHeight)
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    animationRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationRef.current)
  }, [analyserRef, currentStation, isPlaying, pipCanvasRef])

  const onInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setInstallState(choice.outcome === 'accepted' ? 'Installed' : 'Install dismissed')
    setDeferredPrompt(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <audio ref={audioRef} />
      <canvas ref={pipCanvasRef} width={640} height={360} className="hidden" />
      <video ref={videoRef} muted playsInline className="hidden" />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-8 lg:pb-10">
        <header className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-linear-to-br from-slate-900 via-slate-900 to-indigo-950 shadow-2xl">
          <canvas
            ref={canvasRef}
            className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${
              isPlaying ? 'opacity-100' : 'opacity-40'
            }`}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.24),transparent_60%)]" />

          <div className="relative z-10 flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
              <div className="rounded-full border border-orange-500/30 bg-orange-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
                Akashvani Live
              </div>
              <div className="flex flex-col items-start gap-2 text-xs text-slate-300 sm:items-end">
                <span>{smartList.length} smart-ranked channels</span>
                <div className="flex flex-wrap items-center gap-2">
                  {deferredPrompt && (
                    <button
                      type="button"
                      onClick={onInstallClick}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 hover:border-orange-500/60"
                    >
                      <Download size={14} /> Install App
                    </button>
                  )}
                  {installState && <span className="text-emerald-300">{installState}</span>}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
              <img
                src={currentStation.image}
                alt={currentStation.name}
                className="h-20 w-20 rounded-2xl border border-slate-700 object-cover shadow-xl sm:h-28 sm:w-28 lg:h-44 lg:w-44 lg:rounded-3xl"
                onError={(event) => {
                  event.currentTarget.src = 'https://via.placeholder.com/300x300?text=Akashvani'
                }}
              />

              <div className="flex flex-col justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white sm:text-4xl">{currentStation.name}</h1>
                  <p className="mt-2 text-sm text-slate-300 sm:text-base">
                    {currentStation.state} • {currentStation.language}
                  </p>
                  {offline && (
                    <p className="mt-3 flex w-full items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 sm:w-fit">
                      <WifiOff size={16} /> Offline mode active — live streams require internet.
                    </p>
                  )}
                  {error && (
                    <p className="mt-3 w-full rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:w-fit">
                      {error}
                    </p>
                  )}
                  {isLoading && <p className="mt-3 text-sm text-slate-300">Loading stream...</p>}
                </div>

                <div className="hidden flex-wrap items-center gap-3 lg:flex">
                  <button
                    type="button"
                    onClick={playPrev}
                    className="player-btn"
                    aria-label="Previous station"
                  >
                    <SkipBack size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-[0_8px_30px_rgba(249,115,22,0.5)] transition hover:bg-orange-400"
                    aria-label={isPlaying ? 'Pause radio' : 'Play radio'}
                  >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
                  </button>
                  <button type="button" onClick={playNext} className="player-btn" aria-label="Next station">
                    <SkipForward size={20} />
                  </button>

                  <div className="ml-2 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setVolume(volume === 0 ? 1 : 0)}
                      className="text-slate-200"
                      aria-label="Toggle mute"
                    >
                      {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      className="h-1 w-24 accent-orange-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={togglePiP}
                    disabled={!supportsPiP}
                    className="player-btn disabled:cursor-not-allowed disabled:opacity-40"
                    title="Picture in Picture"
                  >
                    <PictureInPicture size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur sm:p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-lg">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by state, language, or station name"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-10 py-2.5 text-sm outline-none ring-orange-500 transition focus:ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 md:justify-end">
              <div className="text-xs text-slate-400">
                Auto favorites: {autoFavorites.length} • Recent plays: {profile.recentPlays.length}
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Smart Queue</h2>
            <div className="relative overflow-hidden rounded-lg">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-linear-to-r from-slate-950/95 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-linear-to-l from-slate-950/95 to-transparent" />
              <div className="no-scrollbar flex w-full snap-x snap-mandatory items-center gap-2 overflow-x-auto px-6 pb-1 whitespace-nowrap">
                {smartList.slice(0, 15).map((station, index) => (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => selectStation(station)}
                    className={`snap-start whitespace-nowrap rounded-full border px-3 py-2 text-xs transition ${
                      station.id === currentStation.id
                        ? 'border-orange-400 bg-orange-500/20 text-orange-100'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {index + 1}. {station.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {Object.keys(groupedStations).length === 0 && (
              <p className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-6 text-center text-slate-400">
                No stations match your search.
              </p>
            )}

            {Object.entries(groupedStations).map(([state, stations]) => (
              <div key={state}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">{state}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {stations.map((station) => (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => selectStation(station)}
                      className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition ${
                        station.id === currentStation.id
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'
                      }`}
                    >
                      {station.id === currentStation.id && (
                        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-orange-400" />
                      )}
                      <img
                        src={station.image}
                        alt={station.name}
                        className="h-14 w-14 rounded-xl object-cover"
                        onError={(event) => {
                          event.currentTarget.src = 'https://via.placeholder.com/80x80?text=AIR'
                        }}
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 truncate text-sm font-semibold text-slate-100">
                          <span className="truncate">{station.name}</span>
                          {station.id === currentStation.id && (
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-300" />
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{station.language}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-800/90 bg-slate-950/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">{currentStation.name}</p>
            <p className="truncate text-[11px] text-slate-400">
              {currentStation.state} • {currentStation.language}
            </p>
          </div>

          <div className="relative flex items-center gap-2">
            <button type="button" onClick={playPrev} className="player-btn" aria-label="Previous station">
              <SkipBack size={18} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-white shadow-[0_8px_30px_rgba(249,115,22,0.5)] transition hover:bg-orange-400"
              aria-label={isPlaying ? 'Pause radio' : 'Play radio'}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
            </button>
            <button type="button" onClick={playNext} className="player-btn" aria-label="Next station">
              <SkipForward size={18} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMobileVolume((prev) => !prev)}
                className="player-btn"
                aria-label="Volume controls"
              >
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              {showMobileVolume && (
                <div className="absolute bottom-14 right-0 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                    className="h-1 w-28 accent-orange-500"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={togglePiP}
              disabled={!supportsPiP}
              className="player-btn disabled:cursor-not-allowed disabled:opacity-40"
              title="Picture in Picture"
            >
              <PictureInPicture size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
