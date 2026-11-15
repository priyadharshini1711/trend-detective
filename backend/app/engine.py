"""Trend Detective statistics engine (Python reference implementation).

Same algorithms as frontend/src/lib/stats.ts, built on NumPy/SciPy, so the
browser results can be independently verified ("Verify with Python" button).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy import stats


def _lag1(a: np.ndarray) -> float:
    d = a - a.mean()
    den = float(np.sum(d * d))
    return 0.0 if den == 0 else float(np.sum(d[1:] * d[:-1]) / den)


@dataclass
class OLS:
    slope: float
    intercept: float
    se: float
    t: float
    p: float
    ciLow: float
    ciHigh: float
    df: float
    r2: float
    r1: float
    nEff: float


def ols(t: np.ndarray, y: np.ndarray, alpha=0.05, ar1=True) -> tuple[OLS, np.ndarray]:
    n = len(t)
    tm, ym = t.mean(), y.mean()
    sxx = np.sum((t - tm) ** 2)
    slope = float(np.sum((t - tm) * (y - ym)) / sxx)
    intercept = float(ym - slope * tm)
    resid = y - (intercept + slope * t)
    sse = float(np.sum(resid ** 2))
    syy = float(np.sum((y - ym) ** 2))
    r1 = _lag1(resid)
    n_eff = max(3.01, n * (1 - r1) / (1 + r1)) if (ar1 and r1 > 0) else float(n)
    df = max(1.0, n_eff - 2)
    se = float(np.sqrt(sse / df / sxx))
    tt = slope / se if se > 0 else float("inf")
    p = float(2 * stats.t.sf(abs(tt), df))
    tq = float(stats.t.ppf(1 - alpha / 2, df))
    return OLS(slope, intercept, se, tt, p, slope - tq * se, slope + tq * se, df,
               0.0 if syy == 0 else 1 - sse / syy, r1, n_eff), resid


@dataclass
class MK:
    S: float
    varS: float
    z: float
    p: float
    tau: float
    senSlope: float
    senIntercept: float
    senLow: float
    senHigh: float
    correction: float


def mann_kendall(t: np.ndarray, y: np.ndarray, alpha=0.05, ar1=True) -> MK:
    n = len(y)
    i, j = np.triu_indices(n, 1)
    S = float(np.sum(np.sign(y[j] - y[i])))
    _, counts = np.unique(y, return_counts=True)
    ties = counts[counts > 1]
    var_s = (n * (n - 1) * (2 * n + 5) - np.sum(ties * (ties - 1) * (2 * ties + 5))) / 18
    dt = t[j] - t[i]
    ok = dt != 0
    slopes = np.sort((y[j] - y[i])[ok] / dt[ok])
    sen = float(np.median(slopes))
    sen_int = float(np.median(y - sen * t))
    corr = 1.0
    if ar1:
        r1 = _lag1(y - sen * t)
        if r1 > 0:
            k = np.arange(1, n)
            corr = float(1 + 2 * np.sum((1 - k / n) * r1 ** k))
    var_s *= corr
    z = (S - np.sign(S)) / np.sqrt(var_s) if S != 0 else 0.0
    p = float(2 * stats.norm.sf(abs(z)))
    N = len(slopes)
    C = stats.norm.ppf(1 - alpha / 2) * np.sqrt(var_s)
    m1 = int(min(N, max(1, round((N - C) / 2))))
    m2 = int(min(N, max(1, round((N + C) / 2) + 1)))
    return MK(S, float(var_s), float(z), p, S / (0.5 * n * (n - 1)), sen, sen_int,
              float(slopes[m1 - 1]), float(slopes[m2 - 1]), corr)


@dataclass
class Pettitt:
    index: int
    time: float
    K: float
    p: float
    meanBefore: float
    meanAfter: float


def pettitt(t: np.ndarray, y: np.ndarray) -> Pettitt:
    n = len(y)
    sgn = np.sign(y[:, None] - y[None, :]).sum(axis=1)
    U = np.cumsum(sgn)[:-1]
    k = int(np.argmax(np.abs(U)))
    K = float(abs(U[k]))
    p = float(min(1.0, 2 * np.exp(-6 * K ** 2 / (n ** 3 + n ** 2))))
    return Pettitt(k, float(t[k]), K, p, float(y[: k + 1].mean()), float(y[k + 1:].mean()))


@dataclass
class Detect:
    nStar: float
    low: float
    high: float
    yearsMore: float
    phi: float
    sigma: float


def years_to_detect(slope: float, resid: np.ndarray, ppy: int, n_years: int) -> Detect:
    """Weatherhead et al. (1998) Eq. 3, generalised to `ppy` samples per year."""
    phi = min(0.95, max(0.0, _lag1(resid)))
    sigma = float(np.std(resid, ddof=1))
    ar = np.sqrt((1 + phi) / (1 - phi))
    n_star = float("inf") if slope == 0 else float(
        (3.3 * sigma * np.sqrt(12 / ppy) / abs(slope) * ar) ** (2 / 3))
    B = 4 / (3 * np.sqrt(max(n_star, 1))) * ar
    return Detect(n_star, n_star * np.exp(-B), n_star * np.exp(B), max(0.0, n_star - n_years), phi, sigma)


def analyze(t, y, points_per_year: int = 1, alpha: float = 0.05, ar1: bool = True) -> dict:
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    o, resid = ols(t, y, alpha, ar1)
    mk = mann_kendall(t, y, alpha, ar1)
    pt = pettitt(t, y)
    start, end = int(np.floor(t[0])), int(np.floor(t[-1]))
    n_years = end - start + 1
    det = years_to_detect(o.slope, resid, points_per_year, n_years)
    sig_o, sig_m = o.p < alpha, mk.p < alpha
    return {
        "engine": f"python/numpy {np.__version__} scipy",
        "n": len(t), "nYears": n_years, "startYear": start, "endYear": end,
        "pointsPerYear": points_per_year,
        "ols": asdict(o), "mk": asdict(mk), "pettitt": asdict(pt), "detect": asdict(det),
        "significant": bool(sig_o and sig_m), "agree": bool(sig_o == sig_m),
        "direction": "flat" if not (sig_o or sig_m) else ("up" if mk.senSlope > 0 else "down"),
    }
