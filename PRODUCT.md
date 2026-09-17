# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Independent language learners practicing foreign language speaking and pronunciation privately and repeatedly without tutor anxiety, recurring cloud subscriptions, or audio latency.

## Product Purpose
LanguageKing empowers language learners to speak foreign languages with royal confidence. It provides an effortless, instantaneous feedback loop: speak any phrase in any foreign language into the mic, receive automatic language recognition, speech transcription, pronunciation grading and plain-English feedback from an on-device local AI model, and immediately compare their own voice against how the phrase should have sounded in native pronunciation.

## Positioning
Private, on-device local model intelligence (e.g. Whisper-v3-Turbo + Wav2Vec2 / local phoneme judge) delivering zero-latency, private acoustic grading and side-by-side native audio comparison without streaming learner audio to remote cloud servers.

## Operating Context
Learners practice in focused solo sessions—at a desk, on a laptop, or in quiet study environments. The learner says whatever phrase or sentence they want to practice without having to read off a prescribed on-screen prompt or manually pick language chips. Key rituals include speaking freely, reviewing which words were pronounced clearly, reading targeted tips, and toggling between the model's native reference audio and their own voice recording.

## Capabilities and Constraints
- Automatic foreign language detection (Spanish, French, Japanese, Italian, German, etc.).
- Free-form speech input: user speaks whatever they want; no on-screen text to read off.
- Hero tactile microphone console with keyboard shortcut (Spacebar) and active waveform animation.
- Simulated and real microphone capture fallback via Web Audio API / MediaRecorder.
- Local model connection interface simulating local Unix sockets, endpoints (e.g. 127.0.0.1:11434), hardware acceleration (Apple Metal / WebGPU), and latency tuning.
- Simple, accessible word-by-word pronunciation assessment without complex IPA phonetic notation.
- Dual audio playback comparison: Native reference speech synthesis vs. learner recorded audio.

## Brand Commitments
- Name: LanguageKing
- Visual World: Royal dark indigo theme with amber gold accents, crown insignia, tactile feedback, and high visual polish without clutter or marketing bloat.
- Tone: Encouraging, precise, regal, focused.

## Evidence on Hand
- Working React 19 + TypeScript + Vite 6 web application in `/Users/kian/Documents/Dev/LanguageKing`.
- Functional automatic language detection and acoustic evaluation engine in `src/App.tsx`.
- Real speech synthesis and audio recording integration.

## Product Principles
1. **Frictionless Loop**: From clicking mic to seeing a grade and hearing native pronunciation in under three seconds.
2. **Speak Freely**: No forced scripts or reading off cards; learners speak whatever phrase they want to practice.
3. **Automatic Detection**: Zero-config language recognition; the local model detects what language is spoken.
4. **Accessible Feedback**: Plain-language tips and simple word clarity badges; no academic phonetic jargon or IPA clutter.
5. **Private & Local-First**: Speech analysis and pronunciation feedback run on-device; learning is private and judgment-free.

## Accessibility & Inclusion
- Full keyboard support (Spacebar to toggle recording).
- Visible focus rings, semantic tags, and high-contrast color status badges (flawless/good/review).
- Graceful degradation with simulated audio capture when microphone permissions are denied.
