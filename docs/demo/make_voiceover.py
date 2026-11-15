import asyncio, re, subprocess, sys, os
import edge_tts

FF = sys.argv[1]
SRC = sys.argv[2]
OUT = sys.argv[3]
WORK = sys.argv[4]
VOICE = sys.argv[5] if len(sys.argv) > 5 else "en-US-AriaNeural"

# (start_sec, max_len_sec, line) - aligned to scene cuts in the 29s demo
LINES = [
    (0.3,  2.7, "This is Trend Detective."),
    (3.2,  4.8, "Pick any place and a question. We suggest the right NASA data."),
    (8.3,  5.2, "Two independent tests on forty-five years of NASA data deliver a clear verdict."),
    (13.9, 4.8, "Scan a whole region: see where it's rising, and where it's falling."),
    (19.0, 3.4, "Explore climate stripes and monthly views."),
    (22.6, 4.7, "Save cases, revisit checkpoints, and sync across devices."),
    (27.5, 3.9, "Honest statistics, for every place on Earth."),
]
TAIL = 2.6  # seconds to hold the end card so the last line fits


def dur(path):
    r = subprocess.run([FF, "-i", path], capture_output=True, text=True)
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def tts(text, path):
    await edge_tts.Communicate(text, VOICE, rate="+6%").save(path)


async def main():
    clips = []
    for i, (start, mx, text) in enumerate(LINES):
        p = os.path.join(WORK, f"line{i}.mp3")
        await tts(text, p)
        d = dur(p)
        tempo = max(1.0, d / mx)
        clips.append((start, p, tempo))
        print(f"{i}: {d:.2f}s (max {mx}) tempo {tempo:.2f}  {text}")

    inputs = ["-i", SRC]
    parts = []
    for i, (start, p, tempo) in enumerate(clips):
        inputs += ["-i", p]
        ms = int(start * 1000)
        parts.append(f"[{i+1}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,atempo={tempo:.3f},adelay={ms}|{ms},volume=1.6[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(clips)))
    parts.append(f"{mix}amix=inputs={len(clips)}:normalize=0,apad,asetpts=PTS-STARTPTS[aout]")
    parts.append(f"[0:v]tpad=stop_mode=clone:stop_duration={TAIL}[vout]")
    total = dur(SRC) + TAIL
    cmd = [FF, "-y", *inputs, "-filter_complex", ";".join(parts),
           "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.2f}",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", OUT]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:]); sys.exit(1)
    print("OK", OUT, f"{dur(OUT):.2f}s")

asyncio.run(main())
