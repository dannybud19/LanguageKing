import { useState, useRef, useEffect, useId, useCallback } from 'react'
import { useSpeechEvaluation } from './speech/useSpeechEvaluation'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  pingLocalModel,
} from './speech/llm/localInterpreter'
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
type RecordingState = 'idle' | 'listening' | 'analyzing' | 'evaluated'
type ModelConnectionStatus = 'connected' | 'connecting' | 'offline'

export function App() {
  const [isPlayingReference, setIsPlayingReference] = useState<boolean>(false)
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState<boolean>(false)

  // Local Model Connection
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [modelStatus, setModelStatus] = useState<ModelConnectionStatus>('connecting')
  /** The actual model tag served by the local server, e.g. "gemma4:e4b". */
  const [modelName, setModelName] = useState<string>(DEFAULT_MODEL)
  const [modelEndpoint, setModelEndpoint] = useState<string>(DEFAULT_BASE_URL)
  const [modelLatency, setModelLatency] = useState<number>(0)
  const [gradingStrictness, setGradingStrictness] = useState<'lenient' | 'standard' | 'strict'>('standard')
  const [hardwareEngine, setHardwareEngine] = useState<string>('Apple Metal (ANE / WebGPU)')
  const [pingStatus, setPingStatus] = useState<string | null>(null)
  const [installedModels, setInstalledModels] = useState<string[]>([])

  /**
   * The whole recognition loop. The acoustic stage settles the language and the
   * score before the language model is consulted, and the model is optional --
   * if the local server is down the learner still gets a language and a grade,
   * just no written transcript or coaching notes.
   */
  const speech = useSpeechEvaluation({
    baseUrl: modelEndpoint,
    model: modelName,
    strictness: gradingStrictness,
    device: hardwareEngine.includes('WebGPU') ? undefined : 'wasm',
  })

  const evaluationResult = speech.result
  const userAudioUrl = speech.userAudioUrl
  const recordDuration = Math.floor(speech.recorder.durationMs / 1000)

  // The UI's four states are a view over the pipeline's finer-grained stages.
  const recordingState: RecordingState =
    speech.stage === 'listening'
      ? 'listening'
      : speech.stage === 'loading-model' ||
          speech.stage === 'recognizing' ||
          speech.stage === 'interpreting'
        ? 'analyzing'
        : speech.stage === 'done'
          ? 'evaluated'
          : 'idle'

  /** What the mic button's spinner should say, so a long first load is legible. */
  const analysingLabel =
    speech.stage === 'loading-model'
      ? `Loading local models… ${Math.round(speech.modelProgress * 100)}%`
      : speech.stage === 'recognizing'
        ? 'Listening to your sounds…'
        : speech.stage === 'interpreting'
          ? 'Writing your coaching notes…'
          : 'Analyzing…'

  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null)

  const endpointInputId = useId()
  const modelSelectId = useId()
  const hardwareSelectId = useId()
  const strictnessSelectId = useId()
  const latencySliderId = useId()

  // Start Speaking / Recording
  //
  // No connection guard here, on purpose: recognition degrades gracefully. With
  // the local model offline the learner still gets a detected language and a
  // pronunciation score from the acoustic model, losing only the transcript and
  // the written coaching. Blocking the mic would discard the working half.
  const handleStartRecording = useCallback(async () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setIsPlayingReference(false)
    setIsPlayingUserAudio(false)
    if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause()
    await speech.start()
  }, [speech])

  const handleStopRecording = useCallback(async () => {
    await speech.stop()
  }, [speech])

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

  // Clean up audio resources on unmount. Recording timers belong to the
  // recorder hook, which tears down its own.
  useEffect(() => {
    return () => {
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

    if (!evaluationResult.transcribedText) {
      // Nothing to read back: the acoustic track produced a score but the
      // local model was not there to turn the sounds into words.
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

  /**
   * Check the local model server for real.
   *
   * Listing the models matters more than a bare reachability check, because
   * "connection refused" and "connected, but that model was never pulled" are
   * different problems with different fixes, and the second one is otherwise
   * indistinguishable from the model simply being bad.
   */
  const handlePingModel = useCallback(async () => {
    setPingStatus('Testing connection…')
    setModelStatus('connecting')

    const result = await pingLocalModel({ baseUrl: modelEndpoint, model: modelName })

    setInstalledModels(result.models)
    setModelLatency(Math.round(result.latencyMs))

    if (!result.ok) {
      setModelStatus('offline')
      setPingStatus(`✗ No server at ${modelEndpoint} — ${result.message}`)
      return
    }

    setModelStatus('connected')
    if (result.hasModel) {
      setPingStatus(`✓ ${modelName} ready — ${Math.round(result.latencyMs)}ms`)
    } else {
      setPingStatus(
        `⚠ Server up, but "${modelName}" is not installed. ` +
          (result.models.length
            ? `Available: ${result.models.slice(0, 4).join(', ')}`
            : 'No models installed.'),
      )
    }
  }, [modelEndpoint, modelName])

  // Check once on mount so the header pill reflects reality rather than a guess.
  useEffect(() => {
    void handlePingModel()
    // Intentionally mount-only; re-checking on every keystroke in the endpoint
    // field would spam the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleConnection = useCallback(() => {
    if (modelStatus === 'connected') {
      // Purely a local view state: there is no session to tear down, so this
      // just stops the app expecting a transcript until it is checked again.
      setModelStatus('offline')
      setPingStatus('Disconnected locally — press Test Connection to reconnect.')
    } else {
      void handlePingModel()
    }
  }, [modelStatus, handlePingModel])

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
                    <span className="record-timer">
                      {`00:${String(recordDuration).padStart(2, '0')}`}
                    </span>
                  </div>
                )}

                {recordingState === 'analyzing' && (
                  <div className="mic-icon-inner analyzing">
                    <div className="spinner-ring" aria-hidden="true" />
                    <span className="mic-subtext">
                      {speech.stage === 'loading-model' ? 'Loading…' : 'Evaluating...'}
                    </span>
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
                  <p className="analyzing-text">{analysingLabel}</p>
                  <div className="eval-progress-bar">
                    {speech.stage === 'loading-model' ? (
                      <div
                        className="eval-progress-shimmer"
                        style={{ width: `${Math.round(speech.modelProgress * 100)}%` }}
                      />
                    ) : (
                      <div className="eval-progress-shimmer" />
                    )}
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
                    <span>
                      {evaluationResult.detectedLanguage} Detected
                      {' · '}
                      {Math.round(evaluationResult.languageConfidence * 100)}% confident
                    </span>
                  </div>
                  {evaluationResult.ambiguous && (
                    <p className="detected-lang-note">
                      Those sounds fit more than one language closely — treat the
                      language above as a best guess.
                    </p>
                  )}
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
              {evaluationResult.translation ? (
                <p className="phrase-translation-sub">“{evaluationResult.translation}”</p>
              ) : (
                <p className="phrase-translation-sub">
                  {speech.interpreterError
                    ? 'Translation needs the local model — it is not responding.'
                    : 'No translation available.'}
                </p>
              )}
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
                      <span>Intonation &amp; Melody</span>
                      <strong title="Needs pitch tracking, which the acoustic model does not produce yet.">
                        {evaluationResult.intonationScore === null
                          ? '—'
                          : `${evaluationResult.intonationScore}%`}
                      </strong>
                    </div>
                    <div className="gauge-track">
                      <div
                        className="gauge-bar gold"
                        style={{ width: `${evaluationResult.intonationScore ?? 0}%` }}
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
                  speech.reset()
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
                  {/* Real model tags reported by the local server. Falls back to
                      the configured value so the field is never empty before the
                      first successful ping. */}
                  {(installedModels.length ? installedModels : [modelName]).map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
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
                <label className="setting-label">Recognition Diagnostics</label>
                <div className="diagnostics-block">
                  {evaluationResult ? (
                    <>
                      {/* The raw sounds the acoustic model heard, uncorrected.
                          Kept out of the learner-facing view by design. */}
                      <p className="diagnostics-ipa">{evaluationResult.heardIpa || '(none)'}</p>
                      <p className="diagnostics-meta">
                        <span>
                          {evaluationResult.detectedLanguage} ·{' '}
                          {Math.round(evaluationResult.languageConfidence * 100)}%
                          {evaluationResult.ambiguous ? ' (ambiguous)' : ''}
                        </span>
                        <span>{Math.round(evaluationResult.durationMs)}ms audio</span>
                        <span>recognise {Math.round(evaluationResult.timings.recognizeMs)}ms</span>
                        <span>transcribe {Math.round(evaluationResult.timings.transcribeMs)}ms</span>
                        <span>coach {Math.round(evaluationResult.timings.interpretMs)}ms</span>
                      </p>
                      {speech.interpreterError && (
                        <p className="diagnostics-meta">
                          <span>Local model: {speech.interpreterError}</span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="diagnostics-empty">
                      Record something to see the detected sounds and timings.
                    </p>
                  )}
                </div>
              </div>

              <div className="setting-group">
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
