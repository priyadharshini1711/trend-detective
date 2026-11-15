import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from scipy import stats
import numpy as np
from app.main import app, build
from app.engine import analyze

client = TestClient(app)
FIX = json.loads(pathlib.Path(__file__).with_name("fixture.json").read_text())

def test_health():
    assert client.get("/api/health").json()["ok"]

def test_analyze_endpoint_matches_engine():
    c = FIX[0]
    r = client.post("/api/analyze", json={"t": c["t"], "y": c["y"], "points_per_year": c["ppy"]}).json()
    assert abs(r["ols"]["slope"] - c["expected"]["ols"]["slope"]) < 1e-12

def test_ols_matches_scipy_without_ar1():
    c = FIX[0]
    r = analyze(c["t"], c["y"], 1, ar1=False)
    lr = stats.linregress(c["t"], c["y"])
    assert abs(r["ols"]["slope"] - lr.slope) < 1e-10 and abs(r["ols"]["p"] - lr.pvalue) < 1e-8

def test_sen_matches_scipy():
    c = FIX[1]
    r = analyze(c["t"], c["y"], 1)
    assert abs(r["mk"]["senSlope"] - stats.theilslopes(c["y"], c["t"]).slope) < 1e-10

def test_step_change_found():
    c = FIX[2]
    assert int(analyze(c["t"], c["y"], 1)["pettitt"]["time"]) in (1993, 1994, 1995)

def test_build_modes():
    vals = {f"{y}{m:02d}": float(m + 0.1 * (y - 2000)) for y in range(2000, 2010) for m in range(1, 13)}
    t, y, ppy = build(vals, "anomaly"); assert ppy == 12 and len(t) == 120
    t, y, _ = build(vals, "DJF"); assert t[0] == 2001.0
    t, y, _ = build(vals, "m7"); assert np.allclose(np.diff(y), 0.1)
