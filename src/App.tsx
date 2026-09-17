import { useState, useRef, useEffect, useId } from 'react'
import './App.css'

// Authored SVG Icons (Craft floor compliant)
function IconCrown({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
    </svg>
  )
}

function IconMic({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

function IconPlay({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function IconStop({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  )
}

function IconGear({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconSparkles({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    </svg>
  )
}

function IconCheck({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconClose({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// Spoken phrases pool for realistic automatic detection when speech recognition isn't available
interface DetectedPhraseData {
  language: string
  langCode: string
  flag: string
  text: string
  translation: string
  goodFeedback: string[]
  flawedFeedback: string[]
  wordsGood: Array<{ word: string; status: 'perfect' | 'good' | 'imperfect'; tip?: string }>
  wordsFlawed: Array<{ word: string; status: 'perfect' | 'good' | 'imperfect'; tip?: string }>
}

const FALLBACK_DETECTIONS: DetectedPhraseData[] = [
  {
    language: 'Spanish',
    langCode: 'es-ES',
    flag: '🇪🇸',
    text: 'Me gustaría pedir un café con leche, por favor',
    translation: 'I would like to order a coffee with milk, please',
    goodFeedback: [
      'Excellent natural cadence and clear syllable timing.',
      'Vowels in "café" and "leche" were pure and unglided.',
      'Soft Spanish dental "d" in "pedir" was articulated naturally.',
    ],
    flawedFeedback: [
      'Soften the "d" in "pedir" — avoid a hard English stop.',
      'Keep the "e" in "leche" crisp rather than drifting into a diphthong.',
      'Good speech pace; keep practicing fluid consonant connections.',
    ],
    wordsGood: [
      { word: 'Me', status: 'perfect' },
      { word: 'gustaría', status: 'perfect' },
      { word: 'pedir', status: 'perfect' },
      { word: 'un', status: 'perfect' },
      { word: 'café', status: 'perfect' },
      { word: 'con', status: 'perfect' },
      { word: 'leche,', status: 'perfect' },
      { word: 'por', status: 'perfect' },
      { word: 'favor', status: 'perfect' },
    ],
    wordsFlawed: [
      { word: 'Me', status: 'perfect' },
      { word: 'gustaría', status: 'good' },
      { word: 'pedir', status: 'imperfect', tip: 'Soften the "d"' },
      { word: 'un', status: 'perfect' },
      { word: 'café', status: 'good' },
      { word: 'con', status: 'perfect' },
      { word: 'leche,', status: 'imperfect', tip: 'Keep the final vowel short' },
      { word: 'por', status: 'good' },
      { word: 'favor', status: 'good' },
    ],
  },
  {
    language: 'French',
    langCode: 'fr-FR',
    flag: '🇫🇷',
    text: "C'est une très belle journée aujourd'hui",
    translation: "It is a very beautiful day today",
    goodFeedback: [
      'Authentic French uvular "r" in "très".',
      'Smooth liaison between "belle" and "journée".',
      'Accurate mouth shape on the final vowel in "aujourd\'hui".',
    ],
    flawedFeedback: [
      'Relax your tongue slightly for a softer French "r" in "très".',
      'Make sure the "u" in "une" is rounded forward with pursed lips.',
      'Cadence was expressive; focus on the rounded vowels.',
    ],
    wordsGood: [
      { word: "C'est", status: 'perfect' },
      { word: 'une', status: 'perfect' },
      { word: 'très', status: 'perfect' },
      { word: 'belle', status: 'perfect' },
      { word: 'journée', status: 'perfect' },
      { word: "aujourd'hui", status: 'perfect' },
    ],
    wordsFlawed: [
      { word: "C'est", status: 'perfect' },
      { word: 'une', status: 'imperfect', tip: 'Round your lips more on "u"' },
      { word: 'très', status: 'imperfect', tip: 'Soften the uvular "r"' },
      { word: 'belle', status: 'good' },
      { word: 'journée', status: 'good' },
      { word: "aujourd'hui", status: 'good' },
    ],
  },
  {
    language: 'Japanese',
    langCode: 'ja-JP',
    flag: '🇯🇵',
    text: '美味しいご飯をありがとうございます',
    translation: 'Thank you very much for the delicious meal',
    goodFeedback: [
      'Even mora timing throughout the entire sentence.',
      'Natural devoiced "su" ending on "arigatou gozaimasu".',
      'Clear, clean Japanese pitch accent.',
    ],
    flawedFeedback: [
      'Keep the vowel lengths even on "oishii" so the double "i" is clearly held.',
      'Lighten the final "u" in "gozaimasu" so it finishes softly.',
      'Rhythm was friendly and respectful.',
    ],
    wordsGood: [
      { word: '美味しい', status: 'perfect' },
      { word: 'ご飯を', status: 'perfect' },
      { word: 'ありがとう', status: 'perfect' },
      { word: 'ございます', status: 'perfect' },
    ],
    wordsFlawed: [
      { word: '美味しい', status: 'imperfect', tip: 'Hold the long "ii" sound' },
      { word: 'ご飯を', status: 'good' },
      { word: 'ありがとう', status: 'good' },
      { word: 'ございます', status: 'imperfect', tip: 'Devoice the ending "su"' },
    ],
  },
  {
    language: 'Italian',
    langCode: 'it-IT',
    flag: '🇮🇹',
    text: 'La vita è bella quando c’è il sole',
    translation: 'Life is beautiful when the sun is out',
    goodFeedback: [
      'Musical intonation and authentic Italian cadence.',
      'Pure, unglided vowels in "vita" and "bella".',
      'Accurate double consonant duration on "bella".',
    ],
    flawedFeedback: [
      'Hold the double "ll" in "bella" for double the duration.',
      'Keep your "o" in "sole" crisp and open without an English glide.',
      'Great musical flow; keep stressing the geminates.',
    ],
    wordsGood: [
      { word: 'La', status: 'perfect' },
      { word: 'vita', status: 'perfect' },
      { word: 'è', status: 'perfect' },
      { word: 'bella', status: 'perfect' },
      { word: 'quando', status: 'perfect' },
      { word: 'c’è', status: 'perfect' },
      { word: 'il', status: 'perfect' },
      { word: 'sole', status: 'perfect' },
    ],
    wordsFlawed: [
      { word: 'La', status: 'perfect' },
      { word: 'vita', status: 'good' },
      { word: 'è', status: 'perfect' },
      { word: 'bella', status: 'imperfect', tip: 'Hold the double "ll"' },
      { word: 'quando', status: 'good' },
      { word: 'c’è', status: 'perfect' },
      { word: 'il', status: 'good' },
      { word: 'sole', status: 'imperfect', tip: 'Keep the "o" vowel pure' },
    ],
  },
  {
    language: 'German',
    langCode: 'de-DE',
    flag: '🇩🇪',
    text: 'Ich wünsche Ihnen einen wunderschönen Tag',
    translation: 'I wish you a wonderful day',
    goodFeedback: [
      'Accurate German soft "ch" sound in "Ich".',
      'Crisp final devoiced consonant in "Tag".',
      'Natural syllable compression in "einen".',
    ],
    flawedFeedback: [
      'In "Ich", aim for a soft palate whisper rather than a hard "k" or "sh".',
      'Make sure the "g" in "Tag" ends on a crisp, unvoiced "k" sound.',
      'Solid confidence; keep practicing the soft "ch".',
    ],
    wordsGood: [
      { word: 'Ich', status: 'perfect' },
      { word: 'wünsche', status: 'perfect' },
      { word: 'Ihnen', status: 'perfect' },
      { word: 'einen', status: 'perfect' },
      { word: 'wunderschönen', status: 'perfect' },
      { word: 'Tag', status: 'perfect' },
    ],
    wordsFlawed: [
      { word: 'Ich', status: 'imperfect', tip: 'Use the soft "ich-laut" whisper' },
      { word: 'wünsche', status: 'good' },
      { word: 'Ihnen', status: 'perfect' },
      { word: 'einen', status: 'good' },
      { word: 'wunderschönen', status: 'good' },
      { word: 'Tag', status: 'imperfect', tip: 'End with a crisp "k"' },
    ],
  },
]

type RecordingState = 'idle' | 'listening' | 'analyzing' | 'evaluated'
type ModelConnectionStatus = 'connected' | 'connecting' | 'offline'

interface EvaluationResult {
  detectedLanguage: string
  detectedLangCode: string
  detectedFlag: string
  transcribedText: string
  translation: string
  score: number
  grade: string
  wordBreakdown: Array<{ word: string; status: 'perfect' | 'good' | 'imperfect'; tip?: string }>
  feedback: string[]
  articulationScore: number
  intonationScore: number
  fluencyScore: number
}

export function App() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordDuration, setRecordDuration] = useState<number>(0)
  const [isPlayingReference, setIsPlayingReference] = useState<boolean>(false)
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState<boolean>(false)
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null)
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null)

  // Local Model State (Fakeable Connection)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [modelStatus, setModelStatus] = useState<ModelConnectionStatus>('connected')
  const [modelName, setModelName] = useState<string>('Whisper-v3-Turbo + Wav2Vec2-Pronounce')
  const [modelEndpoint, setModelEndpoint] = useState<string>('http://127.0.0.1:11434')
  const [modelLatency, setModelLatency] = useState<number>(18)
  const [gradingStrictness, setGradingStrictness] = useState<'lenient' | 'standard' | 'strict'>('standard')
  const [hardwareEngine, setHardwareEngine] = useState<string>('Apple Metal (ANE / WebGPU)')
  const [pingStatus, setPingStatus] = useState<string | null>(null)

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<number | null>(null)
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const detectionIndexRef = useRef<number>(0)

  // Form IDs for accessibility
  const endpointInputId = useId()
  const modelSelectId = useId()
  const hardwareSelectId = useId()
  const strictnessSelectId = useId()
  const latencySliderId = useId()

  // Start Speaking / Recording
  const handleStartRecording = async () => {
    if (modelStatus === 'offline') {
      alert('Local model is currently disconnected. Please connect the local model in settings.')
      setIsSettingsOpen(true)
      return
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setIsPlayingReference(false)
    setIsPlayingUserAudio(false)
    setRecordDuration(0)
    audioChunksRef.current = []

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const audioUrl = URL.createObjectURL(audioBlob)
          setUserAudioUrl(audioUrl)
          stream.getTracks().forEach((track) => track.stop())
        }

        mediaRecorder.start(100)
      }
    } catch {
      console.info('Using simulated local audio capture stream.')
    }

    setRecordingState('listening')

    recordingTimerRef.current = window.setInterval(() => {
      setRecordDuration((prev) => prev + 1)
    }, 1000)
  }

  // Stop Recording & Trigger Automatic Local Model Evaluation
  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop()
      } catch (err) {
        console.warn('Error stopping media recorder:', err)
      }
    }

    setRecordingState('analyzing')

    // Simulate local model inference latency
    const simulatedInferenceDelay = Math.max(450, modelLatency * 12)

    setTimeout(() => {
      // Pick next detection from pool
      const detectionData = FALLBACK_DETECTIONS[detectionIndexRef.current % FALLBACK_DETECTIONS.length]
      detectionIndexRef.current += 1

      const isHighQuality = Math.random() > 0.35
      const baseScore = isHighQuality
        ? Math.floor(Math.random() * 8) + 91
        : Math.floor(Math.random() * 12) + 76

      const strictnessAdjustment =
        gradingStrictness === 'strict' ? -5 : gradingStrictness === 'lenient' ? 4 : 0
      const finalScore = Math.min(99, Math.max(65, baseScore + strictnessAdjustment))

      let grade = 'A'
      if (finalScore >= 95) grade = 'A+ (Native Perfection)'
      else if (finalScore >= 90) grade = 'A (Near Native)'
      else if (finalScore >= 80) grade = 'B+ (Very Good)'
      else grade = 'B (Clear Accent)'

      const fluency = Math.min(98, finalScore + Math.floor(Math.random() * 6) - 2)
      const intonation = Math.min(99, finalScore + Math.floor(Math.random() * 8) - 4)
      const articulation = Math.min(97, finalScore + Math.floor(Math.random() * 5) - 3)

      setEvaluationResult({
        detectedLanguage: detectionData.language,
        detectedLangCode: detectionData.langCode,
        detectedFlag: detectionData.flag,
        transcribedText: detectionData.text,
        translation: detectionData.translation,
        score: finalScore,
        grade,
        wordBreakdown: isHighQuality ? detectionData.wordsGood : detectionData.wordsFlawed,
        feedback: isHighQuality ? detectionData.goodFeedback : detectionData.flawedFeedback,
        articulationScore: articulation,
        intonationScore: intonation,
        fluencyScore: fluency,
      })

      setRecordingState('evaluated')
    }, simulatedInferenceDelay)
  }

  const handleStartRecordingRef = useRef(handleStartRecording)
  const handleStopRecordingRef = useRef(handleStopRecording)

  useEffect(() => {
    handleStartRecordingRef.current = handleStartRecording
    handleStopRecordingRef.current = handleStopRecording
  })

  // Keyboard shortcut: Spacebar to toggle recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        if (recordingState === 'idle' || recordingState === 'evaluated') {
          handleStartRecordingRef.current()
        } else if (recordingState === 'listening') {
          handleStopRecordingRef.current()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [recordingState])

  // Clean up timers & audio resources on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  // Play Native Reference Pronunciation (Powered by Local Model / Speech Synthesis)
  const handlePlayReference = () => {
    if (!evaluationResult) return

    if (isPlayingReference) {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      setIsPlayingReference(false)
      return
    }

    if (isPlayingUserAudio && userAudioPlayerRef.current) {
      userAudioPlayerRef.current.pause()
      setIsPlayingUserAudio(false)
    }

    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.')
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(evaluationResult.transcribedText)
    utterance.lang = evaluationResult.detectedLangCode
    utterance.rate = 0.9
    utterance.pitch = 1.0

    const voices = window.speechSynthesis.getVoices()
    const matchingVoice = voices.find((v) => v.lang.startsWith(evaluationResult.detectedLangCode.slice(0, 2)))
    if (matchingVoice) {
      utterance.voice = matchingVoice
    }

    utterance.onstart = () => setIsPlayingReference(true)
    utterance.onend = () => setIsPlayingReference(false)
    utterance.onerror = () => setIsPlayingReference(false)

    window.speechSynthesis.speak(utterance)
  }

  // Play User's Own Recorded Audio
  const handlePlayUserAudio = () => {
    if (isPlayingUserAudio) {
      if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause()
      setIsPlayingUserAudio(false)
      return
    }

    if (isPlayingReference) {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      setIsPlayingReference(false)
    }

    if (userAudioUrl) {
      if (!userAudioPlayerRef.current) {
        userAudioPlayerRef.current = new Audio(userAudioUrl)
      } else {
        userAudioPlayerRef.current.src = userAudioUrl
      }

      userAudioPlayerRef.current.onended = () => setIsPlayingUserAudio(false)
      userAudioPlayerRef.current.onerror = () => setIsPlayingUserAudio(false)
      userAudioPlayerRef.current.play()
      setIsPlayingUserAudio(true)
    } else {
      setIsPlayingUserAudio(true)
      setTimeout(() => setIsPlayingUserAudio(false), 2400)
    }
  }

  // Fake Ping Local Model
  const handlePingModel = () => {
    setPingStatus('Testing ping...')
    setTimeout(() => {
      if (modelStatus === 'offline') {
        setPingStatus('Error: Connection refused at ' + modelEndpoint)
      } else {
        const pingTime = Math.floor(Math.random() * 8) + 12
        setPingStatus(`✓ 200 OK — ${pingTime}ms via local Unix socket`)
      }
    }, 400)
  }

  // Toggle Fake Connection State
  const handleToggleConnection = () => {
    if (modelStatus === 'connected') {
      setModelStatus('offline')
    } else {
      setModelStatus('connecting')
      setTimeout(() => {
        setModelStatus('connected')
      }, 700)
    }
  }

  return (
    <div className="simple-app-shell">
      {/* Top Header: Brand & Local Model Connection Status */}
      <header className="top-header">
        <div className="brand-zone">
          <div className="brand-crown">
            <IconCrown />
          </div>
          <div>
            <h1 className="brand-name">LanguageKing</h1>
            <p className="brand-tagline">On-Device Speech & Pronunciation Studio</p>
          </div>
        </div>

        {/* Local Model Status Pill */}
        <div className="header-controls">
          <button
            id="model-connection-pill"
            type="button"
            className={`model-pill ${modelStatus}`}
            onClick={() => setIsSettingsOpen(true)}
            title="Configure or test local AI model connection"
          >
            <span className="model-dot" aria-hidden="true" />
            <span className="model-text">
              {modelStatus === 'connected' && `Local Model: Connected (${modelLatency}ms)`}
              {modelStatus === 'connecting' && 'Local Model: Connecting...'}
              {modelStatus === 'offline' && 'Local Model: Offline'}
            </span>
            <IconGear className="gear-icon" />
          </button>
        </div>
      </header>

      {/* Main Studio Arena */}
      <main className="studio-container">
        {/* Practice Studio Stage */}
        <section className="practice-stage-card" aria-label="Speaking practice arena">
          <div className="studio-prompt-wrap">
            <h2 className="studio-prompt-title">Say anything in a foreign language</h2>
            <p className="studio-prompt-subtitle">
              The local model automatically detects your language, transcribes what you said, and grades your pronunciation.
            </p>
          </div>

          {/* Hero Microphone Interaction */}
          <div className="mic-console-wrap">
            <div className="mic-outer-ring">
              <button
                id="hero-mic-button"
                type="button"
                className={`hero-mic-btn ${recordingState}`}
                onClick={() => {
                  if (recordingState === 'idle' || recordingState === 'evaluated') {
                    handleStartRecording()
                  } else if (recordingState === 'listening') {
                    handleStopRecording()
                  }
                }}
                disabled={recordingState === 'analyzing'}
                aria-label={
                  recordingState === 'listening'
                    ? 'Stop recording and evaluate'
                    : 'Start speaking in any foreign language'
                }
              >
                {recordingState === 'idle' && (
                  <div className="mic-icon-inner">
                    <IconMic />
                    <span className="mic-subtext">Tap to Speak</span>
                  </div>
                )}

                {recordingState === 'listening' && (
                  <div className="mic-icon-inner listening">
                    <span className="stop-square" aria-hidden="true" />
                    <span className="mic-subtext">Stop & Grade</span>
                    <span className="record-timer">00:0{recordDuration}</span>
                  </div>
                )}

                {recordingState === 'analyzing' && (
                  <div className="mic-icon-inner analyzing">
                    <div className="spinner-ring" aria-hidden="true" />
                    <span className="mic-subtext">Evaluating...</span>
                  </div>
                )}

                {recordingState === 'evaluated' && (
                  <div className="mic-icon-inner">
                    <IconMic />
                    <span className="mic-subtext">Speak Again</span>
                  </div>
                )}
              </button>

              {/* Acoustic Ripples while active */}
              {recordingState === 'listening' && (
                <>
                  <div className="sound-ripple ripple-1" aria-hidden="true" />
                  <div className="sound-ripple ripple-2" aria-hidden="true" />
                </>
              )}
            </div>

            {/* Status Text & Visualizer */}
            <div className="mic-status-container">
              {recordingState === 'idle' && (
                <p className="mic-hint-text">
                  Click the mic or press <kbd>Spacebar</kbd> to start speaking
                </p>
              )}

              {recordingState === 'listening' && (
                <div className="listening-bar-wrap">
                  <p className="mic-active-text">
                    Listening to your voice... speak naturally
                  </p>
                  <div className="audio-bars" aria-hidden="true">
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                    <span className="bar" />
                  </div>
                </div>
              )}

              {recordingState === 'analyzing' && (
                <div className="analyzing-wrap">
                  <p className="analyzing-text">
                    Local model detecting language & acoustic pronunciation...
                  </p>
                  <div className="eval-progress-bar">
                    <div className="eval-progress-shimmer" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Pronunciation Evaluation Card (Appears after speaking) */}
        {evaluationResult && (
          <section
            id="evaluation-card"
            className="evaluation-card"
            aria-label="Pronunciation evaluation results"
          >
            {/* Tier 1: Hero Verdict Banner & Studio Audio Comparison Deck */}
            <div className="eval-hero-banner">
              <div className="eval-verdict-left">
                <div className="score-ring-unit">
                  <span className="score-num">{evaluationResult.score}</span>
                  <span className="score-denom">/100</span>
                </div>
                <div className="verdict-text-block">
                  <div className="detected-lang-tag">
                    <span className="lang-flag">{evaluationResult.detectedFlag}</span>
                    <span>{evaluationResult.detectedLanguage} Detected</span>
                  </div>
                  <h3 className="verdict-grade-title">{evaluationResult.grade}</h3>
                </div>
              </div>

              {/* Studio Audio Comparison Deck */}
              <div className="audio-comparison-deck">
                <button
                  id="play-reference-audio-btn"
                  type="button"
                  className={`audio-deck-btn native ${isPlayingReference ? 'active' : ''}`}
                  onClick={handlePlayReference}
                  title="Play how this phrase should sound in native pronunciation"
                >
                  <span className="btn-icon">{isPlayingReference ? <IconStop /> : <IconPlay />}</span>
                  <div className="btn-label-block">
                    <span className="btn-subtext">Native Model</span>
                    <span className="btn-maintext">{isPlayingReference ? 'Playing...' : 'How It Should Sound'}</span>
                  </div>
                </button>

                <button
                  id="play-user-audio-btn"
                  type="button"
                  className={`audio-deck-btn user ${isPlayingUserAudio ? 'active' : ''}`}
                  onClick={handlePlayUserAudio}
                  title="Play back your own recorded voice"
                >
                  <span className="btn-icon">{isPlayingUserAudio ? <IconStop /> : <IconPlay />}</span>
                  <div className="btn-label-block">
                    <span className="btn-subtext">Your Voice</span>
                    <span className="btn-maintext">{isPlayingUserAudio ? 'Playing...' : 'Your Recording'}</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Tier 2: Spoken Phrase with Integrated Word Clarity Tokens */}
            <div className="spoken-phrase-stage">
              <div className="phrase-tokens-flow">
                {evaluationResult.wordBreakdown.map((item, idx) => (
                  <div key={`${item.word}-${idx}`} className={`word-clarity-token ${item.status}`}>
                    <span className="token-word">{item.word}</span>
                    <span className="token-status-pill">
                      {item.status === 'perfect' && <IconCheck />}
                      {item.status === 'good' && '•'}
                      {item.status === 'imperfect' && '▲'}
                      <span className="pill-text">
                        {item.status === 'perfect' ? 'Flawless' : item.status === 'good' ? 'Good' : 'Review'}
                      </span>
                    </span>
                    {item.tip && <span className="token-tip-callout">{item.tip}</span>}
                  </div>
                ))}
              </div>
              <p className="phrase-translation-sub">“{evaluationResult.translation}”</p>
            </div>

            {/* Tier 3: Two-Column Diagnostic & Coaching Grid */}
            <div className="eval-details-grid">
              {/* Column A: Acoustic Precision */}
              <div className="detail-panel acoustic-panel">
                <h4 className="panel-title">Acoustic Balance</h4>
                <div className="acoustic-gauges">
                  <div className="gauge-row">
                    <div className="gauge-label-row">
                      <span>Articulation Clarity</span>
                      <strong>{evaluationResult.articulationScore}%</strong>
                    </div>
                    <div className="gauge-track">
                      <div
                        className="gauge-bar emerald"
                        style={{ width: `${evaluationResult.articulationScore}%` }}
                      />
                    </div>
                  </div>

                  <div className="gauge-row">
                    <div className="gauge-label-row">
                      <span>Intonation & Melody</span>
                      <strong>{evaluationResult.intonationScore}%</strong>
                    </div>
                    <div className="gauge-track">
                      <div
                        className="gauge-bar gold"
                        style={{ width: `${evaluationResult.intonationScore}%` }}
                      />
                    </div>
                  </div>

                  <div className="gauge-row">
                    <div className="gauge-label-row">
                      <span>Fluency & Cadence</span>
                      <strong>{evaluationResult.fluencyScore}%</strong>
                    </div>
                    <div className="gauge-track">
                      <div
                        className="gauge-bar cyan"
                        style={{ width: `${evaluationResult.fluencyScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Column B: Model Coaching Notes */}
              <div className="detail-panel coaching-panel">
                <h4 className="panel-title">Model Coaching Notes</h4>
                <ul className="coaching-notes-list">
                  {evaluationResult.feedback.map((tip) => (
                    <li key={tip} className="coaching-note-item">
                      <span className="note-sparkle">
                        <IconSparkles />
                      </span>
                      <span className="note-text">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Tier 4: Clean Action Footer */}
            <div className="eval-action-footer">
              <button
                type="button"
                className="primary-speak-again-btn"
                onClick={() => {
                  setEvaluationResult(null)
                  handleStartRecording()
                }}
              >
                <IconMic />
                <span>Speak Another Phrase</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Local Model Settings Modal (Fakes Local Model Connection) */}
      {isSettingsOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 id="modal-title" className="modal-title">
                  Local AI Model Connection
                </h3>
                <p className="modal-subtitle">
                  Configure and test your on-device speech & pronunciation engine
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close settings"
              >
                <IconClose />
              </button>
            </div>

            <div className="modal-body">
              {/* Connection Status & Quick Toggle */}
              <div className="setting-row highlight-row">
                <div>
                  <div className="setting-label">Connection State</div>
                  <div className="setting-desc">Status of local Unix socket / localhost server</div>
                </div>
                <div className="toggle-cluster">
                  <span className={`status-badge ${modelStatus}`}>
                    {modelStatus === 'connected' && '● Connected'}
                    {modelStatus === 'connecting' && '◌ Connecting...'}
                    {modelStatus === 'offline' && '○ Disconnected'}
                  </span>
                  <button
                    type="button"
                    className={`btn-toggle-conn ${modelStatus}`}
                    onClick={handleToggleConnection}
                  >
                    {modelStatus === 'connected' ? 'Disconnect' : 'Connect Model'}
                  </button>
                </div>
              </div>

              {/* Model Backend Selector */}
              <div className="setting-row">
                <label htmlFor={modelSelectId} className="setting-label">
                  Local Model Architecture
                </label>
                <select
                  id={modelSelectId}
                  className="setting-select"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                >
                  <option value="Whisper-v3-Turbo + Wav2Vec2-Pronounce">
                    Whisper-v3-Turbo + Wav2Vec2 Pronounce (Automatic Language ID)
                  </option>
                  <option value="Whisper.cpp (Local Metal Quantized 8-bit)">
                    Whisper.cpp (Local Metal Quantized 8-bit)
                  </option>
                  <option value="Ollama Speech / Llama-3.2-Audio-Instruct">
                    Ollama Speech / Llama-3.2-Audio-Instruct
                  </option>
                  <option value="In-Browser WebGPU WASM (Zero-Server Local)">
                    In-Browser WebGPU WASM (Zero-Server Local)
                  </option>
                </select>
              </div>

              {/* Endpoint Address */}
              <div className="setting-row">
                <label htmlFor={endpointInputId} className="setting-label">
                  Local Endpoint URL
                </label>
                <div className="input-with-ping">
                  <input
                    id={endpointInputId}
                    type="text"
                    className="setting-input"
                    value={modelEndpoint}
                    onChange={(e) => setModelEndpoint(e.target.value)}
                    placeholder="http://127.0.0.1:11434"
                  />
                  <button type="button" className="btn-ping" onClick={handlePingModel}>
                    Ping
                  </button>
                </div>
                {pingStatus && <p className="ping-result">{pingStatus}</p>}
              </div>

              {/* Hardware Acceleration Engine */}
              <div className="setting-row">
                <label htmlFor={hardwareSelectId} className="setting-label">
                  Hardware Acceleration
                </label>
                <select
                  id={hardwareSelectId}
                  className="setting-select"
                  value={hardwareEngine}
                  onChange={(e) => setHardwareEngine(e.target.value)}
                >
                  <option value="Apple Metal (ANE / WebGPU)">Apple Metal (ANE / Unified RAM)</option>
                  <option value="NVIDIA TensorRT / CUDA">NVIDIA TensorRT / CUDA</option>
                  <option value="WebGPU FP16 In-Browser">WebGPU FP16 In-Browser</option>
                  <option value="CPU AVX-512 Threaded">CPU AVX-512 Multi-threaded</option>
                </select>
              </div>

              {/* Grading Strictness */}
              <div className="setting-row">
                <label htmlFor={strictnessSelectId} className="setting-label">
                  Grading Strictness
                </label>
                <select
                  id={strictnessSelectId}
                  className="setting-select"
                  value={gradingStrictness}
                  onChange={(e) =>
                    setGradingStrictness(e.target.value as 'lenient' | 'standard' | 'strict')
                  }
                >
                  <option value="lenient">Lenient (Beginner friendly)</option>
                  <option value="standard">Standard (Accurate CEFR baseline)</option>
                  <option value="strict">Strict (Native speaker scrutiny)</option>
                </select>
              </div>

              {/* Simulated Latency */}
              <div className="setting-row">
                <div className="slider-label-row">
                  <label htmlFor={latencySliderId} className="setting-label">
                    Simulated Inference Latency
                  </label>
                  <span className="slider-value">{modelLatency}ms</span>
                </div>
                <input
                  id={latencySliderId}
                  type="range"
                  min="5"
                  max="120"
                  value={modelLatency}
                  onChange={(e) => setModelLatency(Number(e.target.value))}
                  className="setting-slider"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-save"
                onClick={() => {
                  setIsSettingsOpen(false)
                }}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Footer */}
      <footer className="simple-footer">
        <p>LanguageKing • Automatic Language Detection & On-Device Pronunciation Grader</p>
      </footer>
    </div>
  )
}

export default App
