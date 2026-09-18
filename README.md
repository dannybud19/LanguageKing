# LanguageKing

Speak a phrase in any foreign language, get your pronunciation graded and coached.
Everything runs on your own machine.

See `PRODUCT.md` for what the product is meant to be. This file is how to run it.

## The pipeline

Four stages, and the division between them is the load-bearing design decision:

| Stage | Model | Runs | Job |
|---|---|---|---|
| 1. Phonemes | wav2vec2 (eSpeak labels) | Browser, WebGPU | The sounds you **actually** made, uncorrected |
| 2. Language | phoneme inventory | Browser | Which language those sounds belong to |
| 3. Transcript | Whisper large-v3-turbo | Browser, WebGPU | The words you said, forced to that language |
| 4. Coaching | Gemma 4 E4B | Local server | Translation and plain-English advice |

Two rules hold the whole thing together:

- **The acoustic track measures; the language model explains.** Every score comes
  from wav2vec2's frame-level confidences. Gemma is called only after the
  language, transcript and scores are final, and nothing it returns can change
  them. Score off an LM's transcript and every learner is graded perfect,
  because an LM renders "I sink so" as "I think so" — erasing the exact error
  the app exists to report.
- **Language ID is by phoneme inventory, not by acoustic classification.** A
  beginner's accent *is* their native language, so an acoustic language
  classifier would answer "English" for an English speaker attempting Spanish.

Stage 4 is optional. With the local server down you still get a language, a
transcript and a grade — you lose the translation and the written coaching, and
the feedback falls back to notes derived from the measurements.

## Running it

```bash
npm install
npm run dev
```

The browser models (~1.2 GB total) download on first recording and are then
served from the HTTP cache, so it works offline afterwards. Grant microphone
permission when prompted.

### The local model (stage 4)

Gemma 4 runs outside the browser, on any server speaking the OpenAI-compatible
chat API — LM Studio, Ollama or llama-server.

**LM Studio** (default: `http://127.0.0.1:1234`)

```bash
lms get gemma-4-E4B-it-qat-q4_0-gguf -y   # ~5.2 GB
lms server start
```

**Ollama** — same idea, but set the endpoint to `http://127.0.0.1:11434` in the
app's settings panel.

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

The live model check is opt-in, because a unit suite that depends on a
background service fails for the wrong reasons:

```bash
LIVE_MODEL=1 npx vitest run localInterpreter.integration
```

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
