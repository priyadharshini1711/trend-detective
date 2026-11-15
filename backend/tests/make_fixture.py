"""Generate synthetic series + Python-engine results, used by the JS parity test."""
import json
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.engine import analyze  # noqa: E402

rng = np.random.default_rng(42)
cases = []


def ar1_noise(n, phi, s):
    e = np.zeros(n)
    for i in range(1, n):
        e[i] = phi * e[i - 1] + rng.normal(0, s)
    return e


yrs = np.arange(1981, 2025, dtype=float)
cases.append(("strong warming annual", yrs, 14 + 0.03 * (yrs - 1981) + rng.normal(0, 0.25, len(yrs)), 1))
cases.append(("weak drying annual", yrs, 2.0 - 0.004 * (yrs - 1981) + ar1_noise(len(yrs), 0.4, 0.3), 1))
cases.append(("step change", yrs, np.where(yrs < 1995, 1.2, 1.8) + rng.normal(0, 0.2, len(yrs)), 1))
tm = 1981 + (np.arange(44 * 12) + 0.5) / 12
cases.append(("monthly anomalies AR1", tm, 0.02 * (tm - 1981) + ar1_noise(len(tm), 0.5, 0.4), 12))
cases.append(("ties (frost days)", yrs, np.round(rng.normal(10, 3, len(yrs)) - 0.05 * (yrs - 1981)), 1))

out = []
for name, t, y, ppy in cases:
    t = [round(float(v), 6) for v in t]
    y = [round(float(v), 6) for v in y]
    out.append({"name": name, "t": t, "y": y, "ppy": ppy, "expected": analyze(t, y, ppy)})

p = pathlib.Path(__file__).with_name("fixture.json")
p.write_text(json.dumps(out))
print("wrote", p, len(out), "cases")
