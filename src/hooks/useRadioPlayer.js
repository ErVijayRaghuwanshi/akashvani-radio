import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'

export function useRadioPlayer(currentStation) {
  const audioRef = useRef(null)
  const hlsRef = useRef(null)
  const videoRef = useRef(null)
  const pipCanvasRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const canAnalyzeStreamRef = useRef(false)
  const currentSourceUrlRef = useRef('')
  const currentIsHlsRef = useRef(false)
  const hlsFallbackTriedRef = useRef(false)

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

    const audioCtx = audioCtxRef.current
    audioCtxRef.current = null

    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => null)
    }
  }, [])

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!canAnalyzeStreamRef.current) return

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
      }

      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    } catch {
      analyserRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!audioRef.current || !currentStation) return
    const audio = audioRef.current
    const sourceUrl = currentStation.liveUrl || currentStation.live_url
    const isHlsStream = /\.m3u8(?:$|\?)/i.test(sourceUrl || '')

    if (!sourceUrl) return

    cleanupHls()
    canAnalyzeStreamRef.current = isHlsStream
    currentSourceUrlRef.current = sourceUrl
    currentIsHlsRef.current = isHlsStream
    hlsFallbackTriedRef.current = false

    if (isHlsStream && Hls.isSupported()) {
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
        ensureAudioGraph().catch(() => null)
        if (isPlaying) {
          audio.play().catch(() => setIsPlaying(false))
        }
      })
    } else {
      if (!isHlsStream) {
        audio.removeAttribute('crossorigin')
        teardownAudioGraph()
      } else {
        audio.crossOrigin = 'anonymous'
      }
      audio.src = sourceUrl
      audio.load()
      if (isHlsStream) {
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
      setIsLoading(false)
      setError('')
    }
    const onError = () => {
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
  }, [cleanupHls])

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
    ensureAudioGraph().finally(() => {
      setIsPlaying((prev) => !prev)
    })
  }, [ensureAudioGraph])

  const stop = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const ensurePiPVideoStream = useCallback(async () => {
    if (!videoRef.current || !pipCanvasRef.current) return false

    if (!videoRef.current.srcObject) {
      videoRef.current.srcObject = pipCanvasRef.current.captureStream(30)
      await videoRef.current.play().catch(() => {})
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
      }
    } catch {
      return
    }
  }, [ensurePiPVideoStream, supportsPiP])

  useEffect(() => {
    if (!supportsPiP) return

    const onVisibilityChange = async () => {
      if (!document.hidden || !isPlaying || document.pictureInPictureElement) return

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
