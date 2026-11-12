import { useEffect, useRef, useState } from 'react'
import { transcribeSpeech } from './api'
import { downsample, encodeWav, mergeSamples, normalizePeak, trimSilence } from './wav'

type RecEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>
}

type Rec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type RecCtor = new () => Rec

function recognitionCtor() {
  const host = window as Window & {
    SpeechRecognition?: RecCtor
    webkitSpeechRecognition?: RecCtor
  }
  return host.SpeechRecognition || host.webkitSpeechRecognition
}

function transcriptOf(result: { 0?: { transcript?: string } }) {
  return result[0]?.transcript || ''
}

function micError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '浏览器没有麦克风权限。请点地址栏的锁，允许麦克风后再试。'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的麦克风。请在系统声音设置里检查输入设备。'
  if (name === 'NotReadableError') return '麦克风被其他程序占用。请关掉占用它的软件后再试。'
  return '麦克风没有打开。请检查系统和浏览器的麦克风权限。'
}

function speechError(code: string) {
  if (code === 'not-allowed') return '浏览器没有麦克风权限。请点地址栏的锁，允许麦克风后再试。'
  if (code === 'audio-capture') return '系统没有把声音交给浏览器。请换一个麦克风，或把正在使用的设备设为 Windows 默认输入。'
  if (code === 'network') return '浏览器的在线语音识别没有连上。麦克风本身有声音，但浏览器要把音频送到它自己的在线服务。'
  if (code === 'service-not-allowed') return '浏览器禁止了语音识别。请换用 Chrome 或 Edge 打开本页。'
  return ''
}

export function useSpeechInput(language: 'zh' | 'en') {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef<Rec | null>(null)
  const stopRef = useRef(false)
  const onChangeRef = useRef<(value: string) => void>(() => {})
  const prefixRef = useRef('')
  const finalRef = useRef('')

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()) && Boolean(navigator.mediaDevices?.getUserMedia))
    return () => {
      stopRef.current = true
      recRef.current?.stop()
    }
  }, [])

  function arm() {
    const Ctor = recognitionCtor()
    if (!Ctor || stopRef.current) return
    const rec = new Ctor()
    rec.lang = language === 'en' ? 'en-US' : 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = transcriptOf(event.results[i])
        if (event.results[i].isFinal) finalRef.current += piece
        else interim += piece
      }
      onChangeRef.current(`${prefixRef.current}${finalRef.current}${interim}`)
    }
    rec.onerror = (event) => {
      const message = speechError(event.error || '')
      if (message) {
        stopRef.current = true
        setError(message)
        setListening(false)
      }
    }
    rec.onend = () => {
      if (stopRef.current) {
        setListening(false)
        return
      }
      window.setTimeout(() => arm(), 250)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
      setError('语音识别没有启动。请再点一次语音。')
    }
  }

  function start(current: string, onChange: (value: string) => void) {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    stopRef.current = false
    setError('')
    onChangeRef.current = onChange
    prefixRef.current = current.trim() ? `${current.trim()} ` : ''
    finalRef.current = ''
    const context = new AudioContext()
    void context.resume()
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
      recRef.current?.stop()
      arm()
    }).catch((reason) => {
      void context.close()
      setError(micError(reason))
      setListening(false)
    })
  }

  function stop() {
    stopRef.current = true
    recRef.current?.stop()
    setListening(false)
  }

  return { listening, supported, error, start, stop }
}

export function useLiveListen(language: 'zh' | 'en') {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(false)
  const generation = useRef(0)
  const onFinalRef = useRef<(text: string) => void>(() => {})
  const recRef = useRef<Rec | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const deviceRef = useRef('')
  const frameRef = useRef(0)
  const bufferRef = useRef('')
  const interimRef = useRef('')
  const lastResultRef = useRef(0)
  const levelRef = useRef(0)
  const localRef = useRef(false)
  const chunksRef = useRef<Float32Array[]>([])
  const heardVoiceRef = useRef(false)
  const lastLoudRef = useRef(0)
  const sendingRef = useRef(false)
  const sampleRateRef = useRef(48000)
  const processorRef = useRef<AudioNode | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()) && Boolean(navigator.mediaDevices?.getUserMedia))
    return () => {
      stopRef.current = true
      generation.current += 1
      recRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      void contextRef.current?.close()
      if (frameRef.current) window.clearInterval(frameRef.current)
    }
  }, [])

  function releaseAudio() {
    if (frameRef.current) window.clearInterval(frameRef.current)
    frameRef.current = 0
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
    chunksRef.current = []
    setLevel(0)
  }

  const localNote = '在线识别连不上，已改用本地语音模型。说完停一下就会转成文字，第一句要加载模型，会稍慢。'

  async function flushLocal() {
    if (!localRef.current || sendingRef.current) return
    const chunks = chunksRef.current.splice(0)
    const { merged, peak } = mergeSamples(chunks)
      const audio = normalizePeak(trimSilence(downsample(merged, sampleRateRef.current, 16000), 16000))
    if (audio.length < 16000 * 0.35 || peak < 0.006) return
    sendingRef.current = true
    setNote('正在把这句话转成文字…')
    try {
      const text = await transcribeSpeech(encodeWav(audio, 16000), language)
      if (text) {
        onFinalRef.current(text)
        if (localRef.current) setNote(localNote)
      } else if (localRef.current) {
        setNote('这段像是杂音或空白，已忽略，不会送给模型。')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '本机语音识别失败')
    } finally {
      sendingRef.current = false
    }
  }

  async function watch(stream: MediaStream, context: AudioContext, token: number) {
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    sampleRateRef.current = context.sampleRate
    const mute = context.createGain()
    mute.gain.value = 0
    mute.connect(context.destination)
    const keep = (channel: Float32Array) => {
      if (stopRef.current || token !== generation.current || channel.length === 0) return
      chunksRef.current.push(channel)
      const maxChunks = Math.ceil((context.sampleRate * 20) / channel.length)
      if (chunksRef.current.length > maxChunks) chunksRef.current.splice(0, chunksRef.current.length - maxChunks)
    }
    try {
      const worklet = URL.createObjectURL(new Blob([
        `class MirrorCapture extends AudioWorkletProcessor {
          constructor() {
            super()
            this.pending = new Float32Array(4096)
            this.used = 0
          }
          process(inputs) {
            const channel = inputs[0] && inputs[0][0]
            if (!channel || !channel.length) return true
            let offset = 0
            while (offset < channel.length) {
              const take = Math.min(this.pending.length - this.used, channel.length - offset)
              this.pending.set(channel.subarray(offset, offset + take), this.used)
              this.used += take
              offset += take
              if (this.used === this.pending.length) {
                this.port.postMessage(this.pending)
                this.pending = new Float32Array(4096)
                this.used = 0
              }
            }
            return true
          }
        }
        registerProcessor('mirror-capture', MirrorCapture)`,
      ], { type: 'application/javascript' }))
      await context.audioWorklet.addModule(worklet)
      URL.revokeObjectURL(worklet)
      const node = new AudioWorkletNode(context, 'mirror-capture')
      node.port.onmessage = (event) => {
        const channel = event.data
        if (channel instanceof Float32Array) keep(channel)
      }
      source.connect(node)
      node.connect(mute)
      processorRef.current = node
    } catch {
      const processor = context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        try {
          if (event.inputBuffer.numberOfChannels < 1) return
          keep(new Float32Array(event.inputBuffer.getChannelData(0)))
        } catch {
          // 采集失败时保持页面可用，不把整页打崩。
        }
      }
      source.connect(processor)
      processor.connect(mute)
      processorRef.current = processor
    }
    const data = new Uint8Array(analyser.fftSize)
    window.clearInterval(frameRef.current)
    frameRef.current = window.setInterval(() => {
      if (stopRef.current || token !== generation.current) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const sample = (value - 128) / 128
        sum += sample * sample
      }
      const level = Math.sqrt(sum / data.length)
      setLevel(level)
      levelRef.current = level
      if (localRef.current) {
        const loud = level > 0.008
        if (loud) {
          heardVoiceRef.current = true
          lastLoudRef.current = Date.now()
        } else if (heardVoiceRef.current && Date.now() - lastLoudRef.current > 700) {
          if (sendingRef.current) return
          heardVoiceRef.current = false
          void flushLocal()
        }
        return
      }
      const pending = `${bufferRef.current} ${interimRef.current}`.trim()
      if (!pending || !lastResultRef.current) return
      const quiet = level < 0.02
      const stalled = Date.now() - lastResultRef.current >= (quiet ? 450 : 800)
      if (stalled) flush()
    }, 100)
  }

  function arm(token: number) {
    const Ctor = recognitionCtor()
    if (!Ctor || stopRef.current || token !== generation.current || localRef.current) return
    const rec = new Ctor()
    rec.lang = language === 'en' ? 'en-US' : 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      if (localRef.current) return
      let interimText = ''
      const finals: string[] = []
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = transcriptOf(event.results[i])
        if (event.results[i].isFinal) {
          if (i >= event.resultIndex) finals.push(piece)
        } else interimText += piece
      }
      if (finals.length) bufferRef.current = `${bufferRef.current}${finals.join('')}`.trim()
      interimRef.current = interimText.trim()
      lastResultRef.current = Date.now()
      setInterim(`${bufferRef.current} ${interimRef.current}`.trim())
    }
    rec.onerror = (event) => {
      if (event.error === 'network' && language !== 'en') {
        localRef.current = true
        heardVoiceRef.current = false
        setError('')
        setNote(localNote)
        try { rec.stop() } catch { /* 已经结束 */ }
        return
      }
      const message = speechError(event.error || '')
      if (message) setError(message)
      if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') {
        stopRef.current = true
        setListening(false)
      }
    }
    rec.onend = () => {
      if (recRef.current === rec) recRef.current = null
      if (stopRef.current || token !== generation.current || localRef.current) return
      window.setTimeout(() => arm(token), 300)
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      setError('语音识别没有启动。请再点一次实时监听。')
    }
  }

  async function open(token: number, context: AudioContext) {
    const audio = deviceRef.current ? { deviceId: { exact: deviceRef.current } } : true
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    if (stopRef.current || token !== generation.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream
    if (context.state !== 'running') await context.resume()
    await watch(stream, context, token)
    const list = await navigator.mediaDevices.enumerateDevices()
    const inputs = list.filter((item) => item.kind === 'audioinput')
    setDevices(inputs)
    const current = stream.getAudioTracks()[0]?.getSettings().deviceId
    if (current) {
      deviceRef.current = current
      setDeviceId(current)
    }
    setListening(true)
    arm(token)
  }

  function flush() {
    const text = `${bufferRef.current} ${interimRef.current}`.trim()
    bufferRef.current = ''
    interimRef.current = ''
    lastResultRef.current = 0
    setInterim('')
    if (text) onFinalRef.current(text)
  }

  function consume() {
    const text = `${bufferRef.current} ${interimRef.current}`.trim()
    bufferRef.current = ''
    interimRef.current = ''
    lastResultRef.current = 0
    setInterim('')
    return text
  }

  function start(onFinal: (text: string) => void) {
    onFinalRef.current = onFinal
    stopRef.current = false
    setError('')
    setInterim('')
    bufferRef.current = ''
    interimRef.current = ''
    lastResultRef.current = 0
    setListening(true)
    if (localRef.current) setNote(localNote)
    else {
      setNote('')
      chunksRef.current = []
      heardVoiceRef.current = false
    }
    generation.current += 1
    const token = generation.current
    recRef.current?.stop()
    releaseAudio()
    const context = new AudioContext()
    contextRef.current = context
    void context.resume()
    void open(token, context).catch((reason) => {
      setError(micError(reason))
      setListening(false)
      releaseAudio()
    })
  }

  function stop() {
    stopRef.current = true
    generation.current += 1
    recRef.current?.stop()
    releaseAudio()
    setListening(false)
    setInterim('')
    setNote('')
    localRef.current = false
    heardVoiceRef.current = false
    bufferRef.current = ''
    interimRef.current = ''
    lastResultRef.current = 0
  }

  function chooseDevice(id: string) {
    deviceRef.current = id
    setDeviceId(id)
    if (!listening || stopRef.current) return
    const keepLocal = localRef.current
    const onFinal = onFinalRef.current
    stop()
    localRef.current = keepLocal
    start(onFinal)
  }

  return { listening, supported, interim, level, devices, deviceId, error, note, start, stop, chooseDevice, consume }
}

export function speak(text: string, language: 'zh' | 'en') {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'en' ? 'en-US' : 'zh-CN'
  const voice = window.speechSynthesis
    .getVoices()
    .find((item) => item.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()))
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

export function useAnswerMic(language: 'zh' | 'en') {
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(false)
  const stopRef = useRef(false)
  const finishingRef = useRef(false)
  const chunksRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef(48000)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioNode | null>(null)
  const frameRef = useRef(0)
  const heardRef = useRef(false)
  const lastLoudRef = useRef(0)
  const onTextRef = useRef<(text: string) => void>(() => {})

  function release() {
    if (frameRef.current) window.clearInterval(frameRef.current)
    frameRef.current = 0
    processorRef.current?.disconnect()
    processorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
    setLevel(0)
  }

  useEffect(() => {
    setSupported(Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioContext !== 'undefined')
    return () => {
      stopRef.current = true
      release()
    }
  }, [])

  async function finish() {
    if (finishingRef.current) return
    finishingRef.current = true
    stopRef.current = true
    setListening(false)
    const chunks = chunksRef.current.splice(0)
    const rate = sampleRateRef.current
    release()
    const { merged, peak } = mergeSamples(chunks)
    const audio = normalizePeak(trimSilence(downsample(merged, rate, 16000), 16000))
    if (audio.length < 16000 * 0.35 || peak < 0.006) {
      setNote('这段像是杂音或空白，已忽略，不会送给模型。')
      finishingRef.current = false
      return
    }
    setTranscribing(true)
    setNote('正在把这句话转成文字…')
    setError('')
    try {
      const text = await transcribeSpeech(encodeWav(audio, 16000), language)
      if (text) {
        setNote('')
        onTextRef.current(text)
      } else {
        setNote('这段像是杂音或空白，已忽略，不会送给模型。')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '本机语音识别失败')
      setNote('')
    } finally {
      setTranscribing(false)
      finishingRef.current = false
    }
  }

  async function listen(context: AudioContext) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (stopRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    streamRef.current = stream
    sampleRateRef.current = context.sampleRate
    if (context.state !== 'running') await context.resume()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const mute = context.createGain()
    mute.gain.value = 0
    mute.connect(context.destination)
    const keep = (channel: Float32Array) => {
      if (stopRef.current || channel.length === 0) return
      chunksRef.current.push(channel)
      const maxChunks = Math.ceil((context.sampleRate * 45) / channel.length)
      if (chunksRef.current.length > maxChunks) {
        stopRef.current = true
        void finish()
      }
    }
    try {
      const worklet = URL.createObjectURL(new Blob([
        `class MirrorAnswer extends AudioWorkletProcessor {
          constructor() {
            super()
            this.pending = new Float32Array(4096)
            this.used = 0
          }
          process(inputs) {
            const channel = inputs[0] && inputs[0][0]
            if (!channel || !channel.length) return true
            let offset = 0
            while (offset < channel.length) {
              const take = Math.min(this.pending.length - this.used, channel.length - offset)
              this.pending.set(channel.subarray(offset, offset + take), this.used)
              this.used += take
              offset += take
              if (this.used === this.pending.length) {
                this.port.postMessage(this.pending)
                this.pending = new Float32Array(4096)
                this.used = 0
              }
            }
            return true
          }
        }
        registerProcessor('mirror-answer', MirrorAnswer)`,
      ], { type: 'application/javascript' }))
      await context.audioWorklet.addModule(worklet)
      URL.revokeObjectURL(worklet)
      const node = new AudioWorkletNode(context, 'mirror-answer')
      node.port.onmessage = (event) => {
        if (event.data instanceof Float32Array) keep(event.data)
      }
      source.connect(node)
      node.connect(mute)
      processorRef.current = node
    } catch {
      const processor = context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        if (event.inputBuffer.numberOfChannels < 1) return
        keep(new Float32Array(event.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(mute)
      processorRef.current = processor
    }
    const data = new Uint8Array(analyser.fftSize)
    frameRef.current = window.setInterval(() => {
      if (stopRef.current) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const sample = (value - 128) / 128
        sum += sample * sample
      }
      const next = Math.sqrt(sum / data.length)
      setLevel(next)
      if (next > 0.008) {
        heardRef.current = true
        lastLoudRef.current = Date.now()
      } else if (heardRef.current && Date.now() - lastLoudRef.current > 2000) {
        void finish()
      }
    }, 100)
    setListening(true)
    setNote('正在听。说完可以再点一次，停顿一会儿也会自动转成文字。')
  }

  function start(onText: (text: string) => void) {
    if (finishingRef.current) return
    stopRef.current = false
    finishingRef.current = false
    chunksRef.current = []
    heardRef.current = false
    lastLoudRef.current = 0
    onTextRef.current = onText
    setError('')
    setNote('正在打开麦克风…')
    setListening(true)
    release()
    const context = new AudioContext()
    contextRef.current = context
    void context.resume()
    void listen(context).catch((reason) => {
      setError(micError(reason))
      setListening(false)
      setNote('')
      release()
    })
  }

  function cancel() {
    stopRef.current = true
    chunksRef.current = []
    release()
    setListening(false)
    setNote('')
  }

  return { listening, transcribing, level, note, error, supported, start, finish, cancel }
}
