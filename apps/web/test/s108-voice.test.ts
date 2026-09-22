// S108 Spec A — the voice ruling's pure halves.
//   · 10 minutes max, REFUSED BEFORE UPLOAD (the phone's own check);
//   · the MIME handling the upload route relies on;
//   · the ruled model and price are the ones the code will log.
import { describe, expect, it } from 'vitest';
import { MAX_SECONDS, voiceLengthRefusal } from '@/components/site-visits/voice-notes';
import {
  TRANSCRIPTION_MODEL,
  TRANSCRIPTION_USD_PER_MINUTE,
  VOICE_MIME,
  VOICE_NOTE_MAX_SECONDS,
  baseMime,
  extensionFor,
} from '@/lib/site-visits/transcribe';

describe('S108 A — the 10-minute cap, before upload', () => {
  it('is the same number on the phone and on the server', () => {
    expect(MAX_SECONDS).toBe(600);
    expect(VOICE_NOTE_MAX_SECONDS).toBe(600);
  });
  it('allows up to exactly 10:00, refuses anything longer, refuses an empty recording', () => {
    expect(voiceLengthRefusal(1)).toBeNull();
    expect(voiceLengthRefusal(600)).toBeNull();
    expect(voiceLengthRefusal(600.1)).toMatch(/10 minutes/);
    expect(voiceLengthRefusal(0)).toMatch(/empty/);
  });
});

describe('S108 A — audio formats', () => {
  it('strips codec parameters (Chrome records audio/webm;codecs=opus)', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(VOICE_MIME.has(baseMime('audio/webm;codecs=opus'))).toBe(true);
  });
  it("accepts iOS Safari's recorder output and names it m4a", () => {
    expect(VOICE_MIME.has('audio/mp4')).toBe(true);
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/mpeg')).toBe('mp3');
  });
  it('refuses a non-audio type', () => {
    expect(VOICE_MIME.has('image/jpeg')).toBe(false);
    expect(VOICE_MIME.has('video/mp4')).toBe(false);
  });
});

describe('S108 A — the ruled model and price', () => {
  it('logs gpt-4o-transcribe at $0.006/minute (verified 2026-09-22; see transcribe.ts)', () => {
    expect(TRANSCRIPTION_MODEL).toBe('gpt-4o-transcribe');
    expect(TRANSCRIPTION_USD_PER_MINUTE).toBe(0.006);
  });
});
