# LanguageKing

Speak a phrase in any foreign language, get your pronunciation graded and coached.
Everything runs on your own machine.

See `PRODUCT.md` for what the product is meant to be. This file is how to run it.

## The pipeline

Five stages, and the division between them is the load-bearing design decision:

| Stage | Model | Runs | Job |
|---|---|---|---|
| 1. Language | Gemma 4 E4B, **hearing the audio** | Local server | Names the language ~0.5 s after you stop |
| 2. Phonemes | wav2vec2 (eSpeak labels) | Browser, WebGPU | The sounds you **actually** made, uncorrected |
| 3. Transcript | Whisper large-v3-turbo | Browser, WebGPU | The words you said, forced to stage 1's language |
| 4. Scores | wav2vec2 frame confidences | Browser | How clearly each word was produced |
| 5. Coaching | Gemma 4 E4B, text only | Local server | Translation and plain-English advice |

Stages 1 and 2 start together the moment recording stops; the language shows
in the UI before transcription has finished.

Three rules hold the whole thing together:

- **The acoustic track measures; the language model explains.** Every score comes
  from wav2vec2's frame-level confidences. Gemma is called only after the
  language, transcript and scores are final, and nothing it returns can change
  them. Score off an LM's transcript and every learner is graded perfect,
  because an LM renders "I sink so" as "I think so" — erasing the exact error
  the app exists to report.
- **Gemma names the language; it never grades.** Gemma 4 E4B has an audio
  encoder, so it hears the words, not just the accent — which is what makes it
  reliable where the phoneme inventory is not. Naming a language is a
  classification it is good at. Confidence comes from its token probabilities,
  never from asking it (asked, it said 0.99 for everything).
- **An accent must not become the answer.** A beginner's accent *is* their
  native language: an English voice reading German was measured coming back
  English 0.61 / German 0.13. So if Gemma's top pick is the learner's native
  language and a foreign language got real probability too, the foreign one
  wins and the result is marked ambiguous. The phoneme inventory breaks close
  calls. See `src/speech/language/decide.ts`.

The local model is optional. With it down you still get a language (from the
phoneme inventory, and the UI says so), a transcript and a grade — you lose
the translation and the written coaching, and the feedback falls back to notes
derived from the measurements.

## Running it

```bash
npm install
npm run dev
```

The browser models (~1.2 GB total) download on first recording and are then
served from the HTTP cache, so it works offline afterwards. Grant microphone
permission when prompted.

### The local model (stages 1 and 5)

Gemma 4 runs outside the browser, on a server speaking the OpenAI-compatible
chat API. Language detection sends audio, which needs two things: a runtime
that knows the `gemma4` architecture, and the model's multimodal projector
(`mmproj`) loaded alongside the weights.

**llama-server** (default: `http://127.0.0.1:8080`) — verified with audio:

```bash
brew install llama.cpp                     # once
lms get gemma-4-E4B-it-qat-q4_0-gguf -y    # ~5.2 GB, if not already downloaded
npm run model                              # fetches the ~1 GB mmproj on first run
```

`npm run model` reuses the GGUF LM Studio downloaded, so nothing is fetched
twice. Override the location with `GEMMA_DIR`, the port with `PORT`.

**LM Studio / Ollama** — work for coaching (stage 5) if you set the endpoint in
settings. Audio language detection through them is unverified: LM Studio
0.3.x could not load `gemma4` at all, and 0.4.x did not re-index the model
after the mmproj was added. If detection gets no answer the app falls back to
the phoneme inventory and says so in the result.

The settings panel has a **Ping** button. It reports which models the server
actually has loaded, so "connection refused" and "running, but that model was
never loaded" are distinguishable — otherwise the second only shows up as a
failed recording.

### Which Gemma 4 variant

`E4B` (5.2 GB at q4_0) is the default, not the larger variants, because this app
runs wav2vec2 and Whisper in the browser at the same time and they compete for
the same unified memory.

Note that `26B-A4B` infers at 4B speed but still needs all 26B of weights
resident — 14.4 GB, which does not fit alongside the browser models on a 16 GB
machine. Stage 4 only turns a phoneme diff into a sentence; it does not need the
larger model.

## Tests

```bash
npm test          # unit suite, no network, no models
npm run lint
```

The live model checks are opt-in, because a unit suite that depends on a
background service fails for the wrong reasons:

```bash
LIVE_MODEL=1 npx vitest run languageDetector.integration   # audio -> language, macOS
LIVE_MODEL=1 npx vitest run localInterpreter.integration   # coaching
```

The detection check synthesises clips in seven languages with the macOS `say`
voices and asserts Gemma names each one correctly in under 3 s.

It asserts the things that would corrupt the product rather than merely break
it: that a small local model returns parseable JSON, puts its note on the word
that actually scored badly, and stays quiet when every word was clean.

Override the target with `LOCAL_MODEL_URL` and `LOCAL_MODEL_ID`.

## Known gaps

- **Intonation is not measured.** It needs an F0 contour compared against a
  reference and there is no pitch tracker in the pipeline, so the UI shows a
  dash rather than a number. A decorative number in a grading UI is a lie.
- **The lexicon path is unused.** `src/speech/lexicon/` and `pipeline.ts`
  implement matching against a known word list, which needs
  `scripts/build-lexicon.mts` — that script does not exist. The free-speech path
  above is what actually runs.
- **Score curves are uncalibrated.** The band boundaries in
  `src/speech/scoring/grade.ts` are a starting point, not tuned against
  recordings of known quality.
