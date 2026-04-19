import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'

const STREAM_PROXY_URL = (import.meta.env.VITE_STREAM_PROXY_URL || '').trim()

const isLikelyHlsUrl = (url) => /\.m3u8(?:$|\?)/i.test(url || '')

const isRadioGardenListenUrl = (sourceUrl) => {
  if (!sourceUrl) return false
  return sourceUrl.startsWith('https://radio.garden/api/ara/content/listen/')
}

const buildProxyPlaybackUrl = (sourceUrl) => {
  if (!STREAM_PROXY_URL || !sourceUrl) return ''
  const proxyBaseUrl = STREAM_PROXY_URL.replace(/\/+$/, '')
  const separator = proxyBaseUrl.includes('?') ? '&' : '?'
  return `${proxyBaseUrl}${separator}url=${encodeURIComponent(sourceUrl)}`
}

const isProxyBlockedSource = (sourceUrl) => {
  if (!sourceUrl) return false

  if (isRadioGardenListenUrl(sourceUrl)) {
    return true
  }

  try {
    const host = new URL(sourceUrl).hostname
    if (host === 'zeno.fm' || host.endsWith('.zeno.fm')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

const buildPlaybackSource = (sourceUrl) => {
  const isHlsStream = isLikelyHlsUrl(sourceUrl)
  const canProxy = Boolean(
    STREAM_PROXY_URL && sourceUrl && !isHlsStream && !isProxyBlockedSource(sourceUrl)
  )

  if (!canProxy) {
    return {
      playbackUrl: sourceUrl,
      originalSourceUrl: sourceUrl,
      usingProxy: false,
      isHlsStream,
      canAnalyzeStream: isHlsStream,
      shouldUseCorsForAnalysis: isHlsStream,
    }
  }

  return {
    playbackUrl: buildProxyPlaybackUrl(sourceUrl),
    originalSourceUrl: sourceUrl,
    usingProxy: true,
    isHlsStream,
    canAnalyzeStream: true,
    shouldUseCorsForAnalysis: true,
  }
}

export function useRadioPlayer(currentStation) {
  const audioRef = useRef(null)
  const hlsRef = useRef(null)
  const videoRef = useRef(null)
  const pipCanvasRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const sourceAudioElementRef = useRef(null)
  const canAnalyzeStreamRef = useRef(false)
  const currentSourceUrlRef = useRef('')
  const currentOriginalSourceUrlRef = useRef('')
  const currentUsingProxyRef = useRef(false)
  const proxyPromotionTriedRef = useRef(false)
  const proxyFallbackTriedRef = useRef(false)
  const currentIsHlsRef = useRef(false)
  const hlsFallbackTriedRef = useRef(false)
  const hasManualPiPSuccessRef = useRef(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const supportsPiP = useMemo(
    () => typeof document !== 'undefined' && !!document.pictureInPictureEnabled,
    [],
  )

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  const teardownAudioGraph = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect()
    } catch {
      // noop
    }
    try {
      analyserRef.current?.disconnect()
    } catch {
      // noop
    }

    sourceNodeRef.current = null
    analyserRef.current = null
    sourceAudioElementRef.current = null

    const audioCtx = audioCtxRef.current
    audioCtxRef.current = null

    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => null)
    }
  }, [])

  const ensureAudioGraph = useCallback(async ({ resumeContext = false } = {}) => {
    const audio = audioRef.current
    if (!audio) return
    if (!canAnalyzeStreamRef.current) return

    if (sourceAudioElementRef.current && sourceAudioElementRef.current !== audio) {
      teardownAudioGraph()
    }

    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        audioCtxRef.current = new AudioCtx()
      }

      if (!analyserRef.current) {
        const analyser = audioCtxRef.current.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.78
        analyserRef.current = analyser
      }

      if (!sourceNodeRef.current) {
        const source = audioCtxRef.current.createMediaElementSource(audio)
        source.connect(analyserRef.current)
        analyserRef.current.connect(audioCtxRef.current.destination)
        sourceNodeRef.current = source
        sourceAudioElementRef.current = audio
      }

      if (resumeContext && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    } catch {
      analyserRef.current = null
    }
  }, [teardownAudioGraph])

  useEffect(() => {
    if (!audioRef.current || !currentStation) return
    const audio = audioRef.current
    const sourceUrl = currentStation.liveUrl || currentStation.live_url
    const {
      playbackUrl,
      originalSourceUrl,
      usingProxy,
      isHlsStream,
      canAnalyzeStream,
      shouldUseCorsForAnalysis,
    } =
      buildPlaybackSource(sourceUrl)

    if (!playbackUrl) return

    cleanupHls()
    canAnalyzeStreamRef.current = canAnalyzeStream
    currentSourceUrlRef.current = playbackUrl
    currentOriginalSourceUrlRef.current = originalSourceUrl
    currentUsingProxyRef.current = usingProxy
    proxyPromotionTriedRef.current = false
    proxyFallbackTriedRef.current = false
    currentIsHlsRef.current = isHlsStream
    hlsFallbackTriedRef.current = false

    if (isHlsStream && Hls.isSupported()) {
      audio.crossOrigin = 'anonymous'
      const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 90,
      })

      hlsRef.current = hls
      hls.loadSource(playbackUrl)
      hls.attachMedia(audio)

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          setIsLoading(false)
          setError('Unable to load this channel stream right now.')
          setIsPlaying(false)
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false)
        ensureAudioGraph().catch(() => null)
        if (isPlaying) {
          audio.play().catch(() => setIsPlaying(false))
        }
      })
    } else {
      if (!canAnalyzeStream) {
        audio.removeAttribute('crossorigin')
        teardownAudioGraph()
      } else if (shouldUseCorsForAnalysis) {
        audio.crossOrigin = 'anonymous'
      } else {
        audio.removeAttribute('crossorigin')
      }
      audio.src = playbackUrl
      audio.load()
      if (canAnalyzeStream) {
        ensureAudioGraph().catch(() => null)
      }
      if (isPlaying) {
        audio.play().catch(() => setIsPlaying(false))
      }
    }

    return cleanupHls
  }, [cleanupHls, currentStation, ensureAudioGraph, isPlaying, teardownAudioGraph])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onCanPlay = () => {
      const originalSourceUrl = currentOriginalSourceUrlRef.current
      const resolvedSrc = audio.currentSrc || audio.src || ''
      const shouldPromoteToProxy =
        Boolean(STREAM_PROXY_URL) &&
        isRadioGardenListenUrl(originalSourceUrl) &&
        !currentUsingProxyRef.current &&
        !proxyPromotionTriedRef.current &&
        Boolean(resolvedSrc) &&
        resolvedSrc !== originalSourceUrl &&
        !isProxyBlockedSource(resolvedSrc)

      if (shouldPromoteToProxy) {
        const promotedPlaybackUrl = buildProxyPlaybackUrl(resolvedSrc)
        if (promotedPlaybackUrl) {
          proxyPromotionTriedRef.current = true
          currentSourceUrlRef.current = promotedPlaybackUrl
          currentOriginalSourceUrlRef.current = resolvedSrc
          currentUsingProxyRef.current = true
          proxyFallbackTriedRef.current = false

          const promotedIsHls = isLikelyHlsUrl(resolvedSrc)
          currentIsHlsRef.current = promotedIsHls
          canAnalyzeStreamRef.current = true

          cleanupHls()

          if (promotedIsHls && Hls.isSupported()) {
            audio.crossOrigin = 'anonymous'
            const hls = new Hls({
              lowLatencyMode: true,
              backBufferLength: 90,
            })

            hlsRef.current = hls
            hls.loadSource(promotedPlaybackUrl)
            hls.attachMedia(audio)

            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data?.fatal) {
                setIsLoading(false)
                setError('Unable to load this channel stream right now.')
                setIsPlaying(false)
              }
            })

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false)
              setError('')
              ensureAudioGraph().catch(() => null)
              if (isPlaying) {
                audio.play().catch(() => setIsPlaying(false))
              }
            })
            return
          }

          audio.crossOrigin = 'anonymous'
          audio.src = promotedPlaybackUrl
          audio.load()
          ensureAudioGraph().catch(() => null)
          if (isPlaying) {
            audio.play().catch(() => setIsPlaying(false))
          }
          return
        }
      }

      setIsLoading(false)
      setError('')
    }
    const onError = () => {
      const originalSourceUrl = currentOriginalSourceUrlRef.current
      const shouldFallbackFromProxy =
        currentUsingProxyRef.current && !proxyFallbackTriedRef.current && Boolean(originalSourceUrl)

      if (shouldFallbackFromProxy) {
        proxyFallbackTriedRef.current = true
        currentUsingProxyRef.current = false

        const fallbackIsHls = isLikelyHlsUrl(originalSourceUrl)
        currentSourceUrlRef.current = originalSourceUrl
        currentIsHlsRef.current = fallbackIsHls
        canAnalyzeStreamRef.current = fallbackIsHls
        cleanupHls()

        if (!fallbackIsHls) {
          audio.removeAttribute('crossorigin')
          teardownAudioGraph()
          audio.src = originalSourceUrl
          audio.load()
          audio.play().catch(() => setIsPlaying(false))
          return
        }

        if (Hls.isSupported()) {
          audio.crossOrigin = 'anonymous'
          const hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 90,
          })

          hlsRef.current = hls
          hls.loadSource(originalSourceUrl)
          hls.attachMedia(audio)

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data?.fatal) {
              setIsLoading(false)
              setError('Unable to load this channel stream right now.')
              setIsPlaying(false)
            }
          })

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false)
            setError('')
            ensureAudioGraph().catch(() => null)
            audio.play().catch(() => setIsPlaying(false))
          })
          return
        }

        audio.crossOrigin = 'anonymous'
        audio.src = originalSourceUrl
        audio.load()
        ensureAudioGraph().catch(() => null)
        audio.play().catch(() => setIsPlaying(false))
        return
      }

      const sourceUrl = currentSourceUrlRef.current
      const resolvedSrc = audio.currentSrc || audio.src || ''
      const resolvedAsHls = /\.m3u8(?:$|\?)/i.test(resolvedSrc)
      const canRetryAsHls =
        Boolean(sourceUrl) &&
        resolvedAsHls &&
        !currentIsHlsRef.current &&
        !hlsFallbackTriedRef.current &&
        Hls.isSupported()

      if (canRetryAsHls) {
        hlsFallbackTriedRef.current = true
        currentIsHlsRef.current = true
        canAnalyzeStreamRef.current = false
        cleanupHls()

        audio.crossOrigin = 'anonymous'
        const hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 90,
        })

        hlsRef.current = hls
        hls.loadSource(sourceUrl)
        hls.attachMedia(audio)

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data?.fatal) {
            setIsLoading(false)
            setError('Unable to load this channel stream right now.')
            setIsPlaying(false)
          }
        })

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false)
          setError('')
          audio.play().catch(() => setIsPlaying(false))
        })
        return
      }

      setIsLoading(false)
      setError('Playback failed. Try another station.')
      setIsPlaying(false)
    }

    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
    }
  }, [cleanupHls, ensureAudioGraph, isPlaying, teardownAudioGraph])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      ensureAudioGraph().finally(() => {
        audio.play().catch(() => {
          setIsPlaying(false)
        })
      })
    } else {
      audio.pause()
    }
  }, [ensureAudioGraph, isPlaying])

  const togglePlay = useCallback(() => {
    ensureAudioGraph({ resumeContext: true }).finally(() => {
      setIsPlaying((prev) => !prev)
    })
  }, [ensureAudioGraph])

  const stop = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const ensurePiPVideoStream = useCallback(async () => {
    if (!videoRef.current || !pipCanvasRef.current) return false
    const pipVideo = videoRef.current

    if ('autoPictureInPicture' in pipVideo) {
      pipVideo.autoPictureInPicture = true
    }

    if (!pipVideo.srcObject) {
      pipVideo.srcObject = pipCanvasRef.current.captureStream(30)
    }

    try {
      await pipVideo.play()
    } catch {
      return false
    }

    return true
  }, [])

  const togglePiP = useCallback(async () => {
    if (!videoRef.current || !supportsPiP) return

    const streamReady = await ensurePiPVideoStream()
    if (!streamReady) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current.requestPictureInPicture()
        hasManualPiPSuccessRef.current = true
        setError('')
      }
    } catch {
      setError('Picture in Picture is unavailable right now. Try again from the player controls.')
      return
    }
  }, [ensurePiPVideoStream, supportsPiP])

  useEffect(() => {
    if (!supportsPiP) return

    const onVisibilityChange = async () => {
      if (
        !document.hidden ||
        !isPlaying ||
        document.pictureInPictureElement ||
        !hasManualPiPSuccessRef.current
      ) {
        return
      }

      const streamReady = await ensurePiPVideoStream()
      if (!streamReady || !videoRef.current) return

      videoRef.current.requestPictureInPicture().catch(() => null)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [ensurePiPVideoStream, isPlaying, supportsPiP])

  useEffect(() => {
    return () => {
      cleanupHls()
      teardownAudioGraph()
    }
  }, [cleanupHls, teardownAudioGraph])

  return {
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
    stop,
    supportsPiP,
    togglePiP,
  }
}
