# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Voicenote** — a React Native (Expo) mobile app for iOS and Android.

Core feature: the user speaks → audio is transcribed (Whisper) → translated (OpenAI/DeepL) → spoken back in the user's cloned voice (ElevenLabs). Future features include personal voice notes and affirmations using the same cloned voice.

## Commands

```bash
npm start          # start Expo dev server (scan QR with Expo Go on phone)
npm run android    # start with Android emulator
npm run ios        # start with iOS simulator (macOS only)
npm run web        # start in browser
```

## Architecture

**Entry point:** `index.js` → `App.js`

The app will be built around three external APIs:
- **OpenAI Whisper** — speech-to-text (POST audio file, receive transcript)
- **OpenAI GPT / DeepL** — text translation
- **ElevenLabs** — text-to-speech with user's cloned voice (requires one-time voice clone setup from a short audio sample)

**Key Expo packages to use:**
- `expo-av` — audio recording and playback
- `expo-file-system` — temporary storage for audio files before upload

**API keys** go in a `.env` file (never committed). Access via `process.env.EXPO_PUBLIC_*` (Expo's convention for client-side env vars).

## Constraints

- `app.json` has `newArchEnabled: true` — use the React Native New Architecture. Avoid packages that are not compatible with it.
- Target is portrait orientation only (`orientation: "portrait"`).
- Audio recording requires explicit microphone permission request at runtime (`expo-av` handles this).
