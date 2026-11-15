"""Trend Detective API — FastAPI.

Endpoints
  GET  /api/health                 liveness
  POST /api/analyze                run the full trend test suite on any series (used by "Verify with Python")
  GET  /api/trend                  fetch NASA POWER for a point and analyse it server-side
  GET  /api/region                 regional grid of trends (Sen slope + Mann-Kendall p per cell)
"""
from __future__ import annotations

import asyncio
import os
from functools import lru_cache

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .engine import analyze

POWER = "https://power.larc.nasa.gov/api/temporal/monthly/point"

app = FastAPI(title="Trend Detective API", version="1.0.0",
              description="Trend detection on NASA POWER (MERRA-2 + CERES) data. NASA Space Apps 2026.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


class Series(BaseModel):
    t: list[float] = Field(..., min_length=8, description="time in decimal years")
    y: list[float] = Field(..., min_length=8)
    points_per_year: int = Field(1, ge=1, le=366)
    alpha: float = Field(0.05, gt=0, lt=0.5)
    ar1: bool = True


@app.get("/api/health")
def health():
    return {"ok": True, "service": "trend-detective", "numpy": np.__version__}


@app.post("/api/analyze")
def analyze_series(s: Series):
    if len(s.t) != len(s.y):
        raise HTTPException(422, "t and y must have the same length")
    return analyze(s.t, s.y, s.points_per_year, s.alpha, s.ar1)


_cache: dict[tuple, dict] = {}


async def fetch_power(client: httpx.AsyncClient, param: str, lat: float, lon: float) -> dict:
    key = (param, round(lat, 2), round(lon, 2))
    if key in _cache:
        return _cache[key]
    last = None
    for end in (2025, 2024):
        r = await client.get(POWER, params=dict(parameters=param, community="AG", latitude=key[1],
                                                longitude=key[2], start=1981, end=end, format="JSON"))
        if r.status_code == 200:
            _cache[key] = r.json()["properties"]["parameter"][param]
            return _cache[key]
        last = r
    raise HTTPException(502, f"NASA POWER error {last.status_code}: {last.text[:200]}")


SEASONS = {"DJF": (12, 1, 2), "MAM": (3, 4, 5), "JJA": (6, 7, 8), "SON": (9, 10, 11)}


def build(values: dict, mode: str) -> tuple[list[float], list[float], int]:
    """Same series construction as frontend/src/lib/power.ts::buildSeries."""
    grid: dict[int, list] = {}
    annual: dict[int, float | None] = {}
    for k, v in values.items():
        y, m = int(k[:4]), int(k[4:])
        v = None if v is None or v == -999 else float(v)
        if m == 13:
            annual[y] = v
            continue
        grid.setdefault(y, [None] * 12)[m - 1] = v
    years = sorted(grid)
    complete = [y for y in years if all(v is not None for v in grid[y])]
    clim = [float(np.mean([grid[y][m] for y in complete])) for m in range(12)]
    t, out, ppy = [], [], 1
    if mode == "annual":
        for y in complete:
            v = annual.get(y)
            out.append(v if v is not None else float(np.mean(grid[y])))
            t.append(float(y))
    elif mode == "anomaly":
        ppy = 12
        for y in years:
            for m, v in enumerate(grid[y]):
                if v is not None:
                    t.append(y + (m + 0.5) / 12)
                    out.append(v - clim[m])
    elif mode in SEASONS:
        for y in years:
            ms = [(grid.get(y - 1) or [None] * 12)[11] if (mode == "DJF" and m == 12) else grid[y][m - 1] for m in SEASONS[mode]]
            if all(v is not None for v in ms):
                t.append(float(y))
                out.append(float(np.mean(ms)))
    elif mode.startswith("m") and mode[1:].isdigit():
        m = int(mode[1:]) - 1
        for y in years:
            if grid[y][m] is not None:
                t.append(float(y))
                out.append(grid[y][m])
    else:
        raise HTTPException(422, f"unknown mode {mode}")
    return t, out, ppy


@app.get("/api/trend")
async def trend(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                param: str = "T2M", mode: str = "annual", ar1: bool = True):
    async with httpx.AsyncClient(timeout=60) as c:
        vals = await fetch_power(c, param, lat, lon)
    t, y, ppy = build(vals, mode)
    return {"lat": lat, "lon": lon, "param": param, "mode": mode, "t": t, "y": y,
            "result": analyze(t, y, ppy, 0.05, ar1)}


@app.get("/api/region")
async def region(lat: float, lon: float, param: str = "T2M", mode: str = "annual",
                 span: float = Query(10, gt=0, le=40), n: int = Query(5, ge=2, le=8)):
    step = span / n
    pts = [(lat + (i - (n - 1) / 2) * step, lon + (j - (n - 1) / 2) * step) for i in range(n) for j in range(n)]
    sem = asyncio.Semaphore(4)

    async def one(c, la, lo):
        async with sem:
            try:
                t, y, ppy = build(await fetch_power(c, param, la, lo), mode)
                r = analyze(t, y, ppy)
                return {"lat": la, "lon": lo, "sen": r["mk"]["senSlope"], "p": r["mk"]["p"]}
            except Exception as e:  # keep the grid going
                return {"lat": la, "lon": lo, "error": str(e)[:120]}

    async with httpx.AsyncClient(timeout=60) as c:
        cells = await asyncio.gather(*(one(c, la, lo) for la, lo in pts))
    return {"param": param, "mode": mode, "cells": cells}
