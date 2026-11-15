import { describe, expect, it } from 'vitest';
import { analyze, tPValue, tQuantile, normCdf } from './stats';
import fixture from '../../../backend/tests/fixture.json';

describe('special functions', () => {
  it('t quantile matches tables', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228, 3);
    expect(tQuantile(0.975, 43)).toBeCloseTo(2.0167, 3);
    expect(tPValue(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4);
  });
});

describe('parity with Python engine', () => {
  for (const c of fixture as any[]) {
    it(c.name, () => {
      const r = analyze(c.t, c.y, c.ppy);
      const py = c.expected;
      expect(r.ols.slope).toBeCloseTo(py.ols.slope, 8);
      expect(r.ols.p).toBeCloseTo(py.ols.p, 6);
      expect(r.ols.ciLow).toBeCloseTo(py.ols.ciLow, 6);
      expect(r.mk.S).toBe(py.mk.S);
      expect(r.mk.p).toBeCloseTo(py.mk.p, 6);
      expect(r.mk.senSlope).toBeCloseTo(py.mk.senSlope, 8);
      expect(r.mk.senLow).toBeCloseTo(py.mk.senLow, 8);
      expect(r.pettitt.index).toBe(py.pettitt.index);
      expect(r.detect.nStar).toBeCloseTo(py.detect.nStar, 6);
    });
  }
});
