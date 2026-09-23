import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { countriesInText, findCountry } from "../countries";
import { previewState, stopPreview, togglePreview } from "../preview-player";

class FakeAudio {
  static created: FakeAudio[] = [];
  paused = true;
  src: string;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.created.push(this);
  }
  play() {
    this.paused = false;
    this.onplaying?.();
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
}

beforeEach(() => {
  (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
  FakeAudio.created = [];
  stopPreview();
});

test("pressing play on the voice that is playing stops it instead of starting a second copy", () => {
  togglePreview("voice-a", "a.mp3");
  assert.deepEqual(previewState(), { id: "voice-a", status: "playing" });
  togglePreview("voice-a", "a.mp3");
  assert.equal(previewState(), null);
  assert.equal(FakeAudio.created.length, 1);
  assert.equal(FakeAudio.created[0].paused, true);
});

test("starting another voice stops the one already playing", () => {
  togglePreview("voice-a", "a.mp3");
  togglePreview("voice-b", "b.mp3");
  const [first, second] = FakeAudio.created;
  assert.equal(first.paused, true);
  assert.equal(second.paused, false);
  assert.equal(FakeAudio.created.filter((player) => !player.paused).length, 1);
  assert.deepEqual(previewState(), { id: "voice-b", status: "playing" });
});

test("a sample that finishes clears the playing state, and a late event from a stopped sample is ignored", () => {
  togglePreview("voice-a", "a.mp3");
  const first = FakeAudio.created[0];
  togglePreview("voice-b", "b.mp3");
  first.onended?.();
  assert.deepEqual(previewState(), { id: "voice-b", status: "playing" });
  FakeAudio.created[1].onended?.();
  assert.equal(previewState(), null);
});

test("region text maps to the right country flags", () => {
  assert.deepEqual(countriesInText("Northern Uganda and South Sudan").map((country) => country.code), ["ug", "ss"]);
  assert.deepEqual(countriesInText("Equatorial Guinea, Gabon and Cameroon").map((country) => country.code), ["gq", "ga", "cm"]);
  assert.deepEqual(countriesInText("Nigeria, Niger and Chad").map((country) => country.code), ["ng", "ne", "td"]);
  assert.deepEqual(countriesInText("Levant"), []);
  assert.equal(findCountry("ivory coast")?.code, "ci");
});
