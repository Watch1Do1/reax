import { Clip } from "../types";

let activeSourceNode: AudioBufferSourceNode | null = null;
let activeAudioCtx: AudioContext | null = null;

/**
 * Stop any currently playing filtered audio and clean up the AudioContext.
 */
export function stopAllFilteredAudio() {
  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
    } catch (e) {}
    activeSourceNode = null;
  }
  if (activeAudioCtx && activeAudioCtx.state !== "closed") {
    try {
      activeAudioCtx.close();
    } catch (e) {}
    activeAudioCtx = null;
  }
}

/**
 * Generate a waveshaper distortion curve.
 */
function makeDistortionCurve(amount: number) {
  const k = typeof amount === "number" ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Play a recorded voice or audio track with custom Web Audio API DSP filters.
 */
export async function playFilteredAudio(base64Audio: string, filterType: string) {
  stopAllFilteredAudio();

  if (!base64Audio) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("Web Audio API not supported. Falling back to default audio.");
      const audio = new Audio(base64Audio);
      audio.play().catch(err => console.error(err));
      return;
    }

    const audioCtx = new AudioContextClass();
    activeAudioCtx = audioCtx;

    // Convert base64 data URL to ArrayBuffer
    const response = await fetch(base64Audio);
    const arrayBuffer = await response.arrayBuffer();

    // Decode audio data asynchronously
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Create Buffer Source Node
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    activeSourceNode = source;

    let lastNode: AudioNode = source;

    if (filterType === "radio") {
      // Bandpass filter centering mid-tones, cutting extreme highs/lows
      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1100;
      bandpass.Q.value = 2.0;

      // Slight static wave shaping
      const waveShaper = audioCtx.createWaveShaper();
      waveShaper.curve = makeDistortionCurve(25);
      waveShaper.oversample = "4x";

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.9;

      source.connect(bandpass);
      bandpass.connect(waveShaper);
      waveShaper.connect(gainNode);
      lastNode = gainNode;
    } 
    else if (filterType === "megaphone") {
      // Squeaky high-frequency megaphone filter
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 400;

      const peaking = audioCtx.createBiquadFilter();
      peaking.type = "peaking";
      peaking.frequency.value = 1800;
      peaking.Q.value = 4.0;
      peaking.gain.value = 16;

      const waveShaper = audioCtx.createWaveShaper();
      waveShaper.curve = makeDistortionCurve(65);
      waveShaper.oversample = "4x";

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.7;

      source.connect(highpass);
      highpass.connect(peaking);
      peaking.connect(waveShaper);
      waveShaper.connect(gainNode);
      lastNode = gainNode;
    } 
    else if (filterType === "robot") {
      // Cybernetic frequency ring modulator
      const ringModulator = audioCtx.createGain();
      
      const oscillator = audioCtx.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = 55; // robotic carrier wave

      const oscGain = audioCtx.createGain();
      oscGain.gain.value = 0.55;

      oscillator.connect(oscGain);
      oscGain.connect(ringModulator.gain);
      oscillator.start();

      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1200;
      bandpass.Q.value = 1.0;

      source.connect(ringModulator);
      ringModulator.connect(bandpass);
      lastNode = bandpass;
    } 
    else if (filterType === "deep") {
      // Shift playback speed down (lowers pitch)
      source.playbackRate.value = 0.78;

      // Heavy low-shelf bass boost
      const bassBoost = audioCtx.createBiquadFilter();
      bassBoost.type = "lowshelf";
      bassBoost.frequency.value = 180;
      bassBoost.gain.value = 8;

      source.connect(bassBoost);
      lastNode = bassBoost;
    } 
    else if (filterType === "chipmunk") {
      // Shift playback speed up (raises pitch)
      source.playbackRate.value = 1.48;

      // Filter out low rumbles to make it squeaky
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 450;

      source.connect(highpass);
      lastNode = highpass;
    }

    // Connect final output to AudioContext speakers destination
    lastNode.connect(audioCtx.destination);
    source.start();
  } catch (error) {
    console.error("Failed filtered audio playback:", error);
    try {
      const audio = new Audio(base64Audio);
      audio.play().catch(e => console.error(e));
    } catch (e) {}
  }
}

/**
 * Synthesizes speech using the browser's Web Speech API, with custom voice settings (pitch, rate)
 * tailored to express the chosen emotional tone.
 */
export function speakText(
  text: string, 
  tone: Clip["tone"], 
  voiceStyle?: "casual" | "sarcastic" | "dramatic" | "announcer" | "oldschool"
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    console.warn("Web Speech API is not supported in this environment.");
    return;
  }

  // Cancel any currently playing speech to avoid overlap
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // If a specific voice style is active, use it. Otherwise map the tone style.
  const activeStyle = voiceStyle || (
    tone === "funny" ? "oldschool" :
    tone === "sarcastic" ? "sarcastic" :
    tone === "dramatic" ? "dramatic" :
    tone === "chill" ? "casual" : "announcer"
  );

  // Apply highly expressive parameters based on the selected voice style or mapped reaction tone
  switch (activeStyle) {
    case "oldschool":
      utterance.pitch = 1.45;
      utterance.rate = 1.25;
      break;
    case "dramatic":
      utterance.pitch = 0.65;
      utterance.rate = 0.75;
      break;
    case "sarcastic":
      utterance.pitch = 0.82;
      utterance.rate = 0.88;
      break;
    case "casual":
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
      break;
    case "announcer":
      utterance.pitch = 0.55;
      utterance.rate = 0.85;
      break;
    default:
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
  }

  // Attempt to select an english natural-sounding voice if available
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const englishVoice = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.toLowerCase().includes("google") ||
          v.name.toLowerCase().includes("natural") ||
          v.name.toLowerCase().includes("premium") ||
          v.name.toLowerCase().includes("siri") ||
          v.name.toLowerCase().includes("daniel"))
    ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];

    if (englishVoice) {
      utterance.voice = englishVoice;
    }
  }

  window.speechSynthesis.speak(utterance);
}
