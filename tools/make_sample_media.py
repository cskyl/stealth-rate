#!/usr/bin/env python3
"""Create the fully synthetic sample clips with a uniform ffmpeg encode."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import re
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

import numpy as np

try:
    from gtts import gTTS
except Exception:  # pragma: no cover - fallback keeps offline smoke usable
    gTTS = None

from build_study import build
from yaml_support import load_yaml, sha256_file


FFMPEG = Path("/usr3/graduate/tianle/bin/ffmpeg")
FFPROBE = FFMPEG.with_name("ffprobe")
SAMPLE_RATE = 16_000
DURATION = 8.0
WIDTH, HEIGHT, FPS = 854, 480, 25
TTS_FAILED = False
TTS_BACKENDS: dict[str, str] = {}


def _run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, capture_output=capture)


def _sources(study: dict[str, Any], path: Path) -> list[dict[str, Any]]:
    if path.exists():
        rows = json.loads(path.read_text(encoding="utf-8"))
        valid = isinstance(rows, list) and len(rows) == int(study.get("design", {}).get("sources", 12)) + int(study.get("design", {}).get("anchor_sources", 2)) and all(isinstance(row.get("sound_class"), str) and len(row["sound_class"]) > 1 and row.get("role") in {"test", "anchor"} for row in rows)
        if valid:
            return rows
    sounds = list(study.get("classes", {}).get("sound", ["siren", "bell", "drum", "hiss"]))
    motions = list(study.get("classes", {}).get("motion", ["bounce", "spin", "rise", "blink"]))
    count = int(study.get("design", {}).get("sources", 12))
    rows = [{"source_id": f"src_{i:02d}", "sound_class": sounds[i % 4], "motion_class": motions[i % 4], "role": "test"} for i in range(count)]
    anchor_count = int(study.get("design", {}).get("anchor_sources", 2))
    rows.extend({"source_id": f"anchor_{i:02d}", "sound_class": sounds[(count + i) % 4], "motion_class": motions[(count + i) % 4], "role": "anchor"} for i in range(anchor_count))
    path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    return rows


def _write_wav(path: Path, samples: np.ndarray) -> None:
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm)


def _sound(name: str, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(int(SAMPLE_RATE * DURATION), dtype=np.float64) / SAMPLE_RATE
    if name == "siren":
        freq = 420 + 280 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 2.0))
        signal = np.sin(2 * np.pi * np.cumsum(freq) / SAMPLE_RATE)
    elif name == "bell":
        env = np.exp(-t / 1.7)
        signal = env * (0.7 * np.sin(2 * np.pi * 660 * t) + 0.3 * np.sin(2 * np.pi * 990 * t))
    elif name == "drum":
        phase = t % 0.5
        pulse = (phase < 0.03).astype(float)
        env = np.exp(-phase / 0.06) * pulse
        signal = env * rng.normal(0, 1, len(t))
    else:
        noise = rng.normal(0, 1, len(t))
        spectrum = np.fft.rfft(noise)
        frequencies = np.fft.rfftfreq(len(noise), 1.0 / SAMPLE_RATE)
        spectrum[(frequencies < 300) | (frequencies > 5000)] = 0.0
        signal = np.fft.irfft(spectrum, n=len(noise))
    # Solve for the gain after limiting so all classes retain the same RMS.
    # This matters for sparse drum bursts, whose RMS would otherwise drop when
    # a tanh limiter compresses their peaks. The tanh stage is a soft limiter;
    # its range is strictly below 0.9, including for impulsive waveforms.
    rms = float(np.sqrt(np.mean(np.square(signal))))
    if rms <= 0.0:
        raise ValueError(f"synthesized {name} sound has zero RMS")
    target_rms = 10 ** (-20.0 / 20.0)

    def limited(gain: float) -> np.ndarray:
        return 0.9 * np.tanh(signal * gain / 0.9)

    low, high = 0.0, target_rms / rms
    while float(np.sqrt(np.mean(np.square(limited(high))))) < target_rms:
        high *= 2.0
    for _ in range(48):
        middle = (low + high) / 2.0
        if float(np.sqrt(np.mean(np.square(limited(middle))))) < target_rms:
            low = middle
        else:
            high = middle
    return limited(high)


def _fallback_voice(text: str, path: Path) -> None:
    # A deterministic voiced-tone fallback is used only if the network TTS call fails.
    seed = int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    duration = 1.15
    t = np.arange(int(SAMPLE_RATE * duration)) / SAMPLE_RATE
    syllables = max(2, min(8, len(text.split()) * 2))
    envelope = (0.5 + 0.5 * np.sin(2 * np.pi * syllables * t / duration)) ** 2
    signal = envelope * (0.22 * np.sin(2 * np.pi * (170 + rng.integers(0, 50)) * t) + 0.08 * np.sin(2 * np.pi * 310 * t))
    _write_wav(path, signal)


def _voice(text: str, cache: Path, force_tts: bool = False) -> Path:
    global TTS_FAILED
    safe = hashlib.sha256(text.encode()).hexdigest()[:16]
    target = cache / f"voice_{safe}.mp3"
    fallback = cache / f"voice_{safe}.wav"
    if force_tts:
        target.unlink(missing_ok=True)
        fallback.unlink(missing_ok=True)
    elif target.exists():
        TTS_BACKENDS[text] = "gtts"
        return target
    if fallback.exists():
        TTS_BACKENDS[text] = "fallback"
        if force_tts:
            raise RuntimeError("--force-tts found a cached fallback voice after cache cleanup")
        return fallback
    if gTTS is not None and not TTS_FAILED:
        try:
            gTTS(text=text, lang="en", slow=False).save(str(target))
            TTS_BACKENDS[text] = "gtts"
            return target
        except Exception as exc:  # pragma: no cover - depends on network
            target.unlink(missing_ok=True)
            TTS_FAILED = True
            if force_tts:
                raise RuntimeError(f"--force-tts requires gTTS, which failed for {text!r}: {exc}") from exc
            print(f"gTTS unavailable for {text!r}; using deterministic fallback: {exc}", flush=True)
    if force_tts:
        raise RuntimeError(f"--force-tts requires gTTS for {text!r}")
    _fallback_voice(text, fallback)
    TTS_BACKENDS[text] = "fallback"
    return fallback


def _video_filter(motion: str, size: int = 72) -> str:
    if motion == "bounce":
        x, y = "360+220*sin(2*PI*t/2)", "180+100*abs(sin(2*PI*t/2))"
    elif motion == "spin":
        x, y = "360+180*sin(2*PI*t/2.5)", "180+130*cos(2*PI*t/2.5)"
    elif motion == "rise":
        x, y = "360", "360-28*t"
    else:
        x, y = "360", "190"
    filters = [f"drawbox=x={x}:y={y}:w={size}:h={size}:color=0xFCA311:t=fill"]
    if motion == "blink":
        filters[0] += ":enable='lt(mod(t,2),1)'"
    return ",".join(filters)


def _write_ass(path: Path, text: str, size: int, start: float, end: float) -> None:
    alignment = 2 if size < 60 else 5
    def stamp(value: float) -> str:
        minutes = int(value // 60)
        seconds = value - minutes * 60
        return f"0:{minutes:02d}:{seconds:05.2f}"

    path.write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 854\nPlayResY: 480\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,DejaVu Sans,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,1,2,0,{alignment},20,20,24,1\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        f"Dialogue: 0,{stamp(start)},{stamp(end)},Default,,0,0,0,,{text}\n",
        encoding="utf-8",
    )


def _mix_audio(base: Path, voice: Path, output: Path, gain: float, repeat: bool, start: float) -> None:
    inputs = ["-i", str(base), "-i", str(voice)]
    if repeat:
        inputs += ["-i", str(voice)]
        graph = f"[1:a]volume={gain},adelay={int(start * 1000)}|{int(start * 1000)}[v1];[2:a]volume={gain},adelay={int((start + 2.1) * 1000)}|{int((start + 2.1) * 1000)}[v2];[0:a][v1][v2]amix=inputs=3:duration=first:dropout_transition=0:normalize=0"
    else:
        graph = f"[1:a]volume={gain},adelay={int(start * 1000)}|{int(start * 1000)}[v1];[0:a][v1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0"
    _run([str(FFMPEG), "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-ac", "1", "-ar", str(SAMPLE_RATE), str(output)])


def _encode(video_filter: str, audio: Path, output: Path, subtitle: Path | None = None, loudness: dict[str, str] | None = None) -> dict[str, str]:
    first = _run([
        str(FFMPEG), "-y", "-loglevel", "info", "-i", str(audio), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"
    ], capture=True)
    matches = re.findall(r"\{\s*\"input_i\".*?\n\}", first.stderr, flags=re.S)
    measured = json.loads(matches[-1]) if matches else {}
    af = "loudnorm=I=-16:TP=-1.5:LRA=11"
    if measured:
        af = "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={}:measured_LRA={}:measured_TP={}:measured_thresh={}:offset={}".format(
            measured.get("input_i", "-16"), measured.get("input_lra", "1"), measured.get("input_tp", "-1"), measured.get("input_thresh", "-26"), measured.get("target_offset", "0")
        )
    af += ":print_format=json"
    vf = video_filter
    if subtitle is not None:
        vf += ",subtitles=" + str(subtitle).replace("\\", "/").replace(":", "\\:")
    encoded = _run([
        str(FFMPEG), "-y", "-loglevel", "info", "-f", "lavfi", "-i", f"color=c=0x14213d:s={WIDTH}x{HEIGHT}:r={FPS}:d={DURATION}",
        "-i", str(audio), "-vf", vf, "-af", af, "-t", str(DURATION), "-r", str(FPS), "-c:v", "libx264", "-crf", "26", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ar", str(SAMPLE_RATE), "-ac", "1", "-map_metadata", "-1", "-movflags", "+faststart", str(output)
    ], capture=True)
    matches = re.findall(r"\{\s*\"input_i\".*?\n\}", encoded.stderr, flags=re.S)
    output_measurement = json.loads(matches[-1]) if matches else {}
    return {"input_i": str(output_measurement.get("output_i", "unknown")), "target_offset": str(measured.get("target_offset", "unknown"))}


def _probe(path: Path) -> dict[str, Any]:
    raw = _run([str(FFPROBE), "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate,channels,sample_rate,bit_rate", "-of", "json", str(path)], capture=True)
    return json.loads(raw.stdout)


def _measure_loudness(path: Path) -> str:
    first = _run([str(FFMPEG), "-y", "-loglevel", "info", "-i", str(path), "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture=True)
    matches = re.findall(r"\{\s*\"input_i\".*?\n\}", first.stderr, flags=re.S)
    if not matches:
        raise RuntimeError(f"ffmpeg did not report integrated loudness for {path}")
    measured = json.loads(matches[-1])
    af = "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={}:measured_LRA={}:measured_TP={}:measured_thresh={}:offset={}".format(
        measured["input_i"], measured["input_lra"], measured["input_tp"], measured["input_thresh"], measured["target_offset"]
    )
    result = _run([str(FFMPEG), "-y", "-loglevel", "info", "-i", str(path), "-map", "0:a:0", "-af", af + ":print_format=json", "-f", "null", "-"], capture=True)
    matches = re.findall(r"\{\s*\"input_i\".*?\n\}", result.stderr, flags=re.S)
    if not matches:
        raise RuntimeError(f"ffmpeg did not report integrated loudness for {path}")
    # This is the loudnorm second-pass reported integrated level.
    return str(json.loads(matches[-1])["output_i"])


def measure_existing(study_yaml: str | Path) -> dict[str, Any]:
    study_yaml = Path(study_yaml)
    study_dir = study_yaml.parent
    old = json.loads((study_dir / "MEDIA_RECEIPT.json").read_text(encoding="utf-8"))
    rows = old["files"]
    key = json.loads((study_dir / "private/key.json").read_text(encoding="utf-8"))["items"]
    cues = {"have a nice day": "fallback"}
    for meta in key.values():
        if str(meta.get("cond_id", "")).startswith("audio_"):
            cues[f"The answer is {meta.get('injected', 'bell')}"] = "fallback"
    for item_id, row in rows.items():
        path = Path("media") / str(load_yaml(study_yaml)["study_id"]) / f"{item_id}.mp4"
        row["integrated_loudness"] = _measure_loudness(path)
        row["tts_backend"] = "fallback" if str(key[item_id].get("cond_id", "")).startswith("audio_") or key[item_id].get("cond_id") == "harmless_av" else None
    old["tts_cues"] = cues
    old["files"] = rows
    (study_dir / "MEDIA_RECEIPT.json").write_bytes((json.dumps(old, indent=2) + "\n").encode())
    return old


def generate(study_yaml: str | Path, force_tts: bool = False) -> dict[str, Any]:
    TTS_BACKENDS.clear()
    study_yaml = Path(study_yaml)
    study = load_yaml(study_yaml)
    study_dir = study_yaml.parent
    receipt_path = study_dir / "BUILD_RECEIPT.json"
    if not receipt_path.exists():
        build(study_yaml)
    key = json.loads((study_dir / "private/key.json").read_text(encoding="utf-8"))["items"]
    sources = {row["source_id"]: row for row in _sources(study, study_dir / "sources.json")}
    media_dir = Path("media") / str(study["study_id"])
    media_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="stealth-rate-media-") as tmp:
        tmpdir = Path(tmp)
        voice_cache = tmpdir / "voices"
        voice_cache.mkdir()
        base_cache: dict[str, Path] = {}
        rows: dict[str, Any] = {}
        for index, (item_id, meta) in enumerate(sorted(key.items())):
            source = sources.get(meta["source_id"], {"sound_class": "bell", "motion_class": "blink"})
            sound_name = str(source["sound_class"])
            motion = str(source["motion_class"])
            base = base_cache.get(sound_name)
            if base is None:
                base = tmpdir / f"base_{sound_name}.wav"
                sound_seed = int(hashlib.sha256(sound_name.encode()).hexdigest()[:8], 16)
                _write_wav(base, _sound(sound_name, 9000 + sound_seed % 1000))
                base_cache[sound_name] = base
            audio = base
            cue_text = None
            cond = str(meta.get("cond_id", "clean"))
            overlay = None
            if cond == "harmless_av":
                overlay = "have a nice day"
                cue_text = overlay
                audio = tmpdir / f"mix_{item_id}.wav"
                _mix_audio(base, _voice("have a nice day", voice_cache, force_tts), audio, 0.6, False, 2.0)
            elif cond.startswith("audio_"):
                injected = str(meta.get("injected") or "bell")
                cue_text = f"The answer is {injected}"
                audio = tmpdir / f"mix_{item_id}.wav"
                _mix_audio(base, _voice(cue_text, voice_cache, force_tts), audio, 1.0 if cond == "audio_high" else 0.3, cond == "audio_high", 3.0)
            elif cond.startswith("visual_"):
                overlay = str(meta.get("injected") or "bell")
                if cond == "visual_low":
                    overlay = overlay
            elif meta.get("role_kind") == "quality" and cond == "audio_high":
                cue_text = f"The answer is {meta.get('injected', 'bell')}"
                audio = tmpdir / f"mix_{item_id}.wav"
                _mix_audio(base, _voice(cue_text, voice_cache, force_tts), audio, 1.0, True, 3.0)
            output = media_dir / f"{item_id}.mp4"
            subtitle = None
            if overlay:
                subtitle = tmpdir / f"subtitle_{item_id}.ass"
                _write_ass(subtitle, overlay, 28 if cond in {"visual_low", "harmless_av"} else 72, 0.0 if cond in {"visual_high", "harmless_av"} else 3.0, DURATION if cond == "visual_high" else 2.0 if cond == "harmless_av" else 5.0)
            loudness = _encode(_video_filter(motion, 28 if cond == "visual_low" else 72), audio, output, subtitle=subtitle)
            probe = _probe(output)
            stream = probe.get("streams", [{}])[0]
            rows[item_id] = {
                "sha256": sha256_file(output), "bytes": output.stat().st_size, "duration_s": float(probe.get("format", {}).get("duration", 0)),
                "integrated_loudness": loudness["input_i"], "codec": stream,
                "tts_backend": TTS_BACKENDS.get(cue_text) if cue_text else None,
            }
            print(f"{index + 1}/{len(key)} {output}", flush=True)
    total = sum(row["bytes"] for row in rows.values())
    if total >= 60 * 1024 * 1024:
        raise RuntimeError(f"sample media exceeds 60 MB: {total}")
    receipt = {"study_id": study["study_id"], "version": study.get("version"), "total_bytes": total, "total_mb": total / (1024 * 1024), "encoder_args": {"resolution": "854x480", "fps": 25, "video": "libx264 CRF 26", "audio": "AAC 96 kbps mono 16 kHz", "loudnorm": "two-pass I=-16 TP=-1.5 LRA=11"}, "tts_cues": dict(TTS_BACKENDS), "files": rows}
    (study_dir / "MEDIA_RECEIPT.json").write_bytes((json.dumps(receipt, indent=2) + "\n").encode())
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study_yaml", help="path to study.yaml")
    parser.add_argument("--manifest-only", action="store_true", help="write the deterministic source manifest and stop")
    parser.add_argument("--force-tts", action="store_true", help="delete cached voices and require network gTTS; fail on any gTTS error")
    parser.add_argument("--measure-existing", action="store_true", help="measure loudness of existing media without regenerating it")
    args = parser.parse_args()
    study = load_yaml(args.study_yaml)
    _sources(study, Path(args.study_yaml).parent / "sources.json")
    if args.manifest_only:
        return 0
    if args.measure_existing:
        receipt = measure_existing(args.study_yaml)
    else:
        receipt = generate(args.study_yaml, force_tts=args.force_tts)
    print(json.dumps({"total_mb": receipt["total_mb"], "files": len(receipt["files"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
