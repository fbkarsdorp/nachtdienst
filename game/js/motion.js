// How things move in the archive: slowly, starting and stopping without a jolt.

// sine in-out: no sudden start, a peak speed only half again the average
export const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

// A walk: speed builds over the first stretch, holds, and dies away over the last.
// `r` is the share of the time spent speeding up (and again slowing down);
// r = 0.5 is the plain sine ease.
export function stride(t, r = 0.3) {
  t = Math.min(1, Math.max(0, t));
  if (r >= 0.5) return ease(t);
  const v = 1 / (1 - r);
  const up = (x) => v * (x / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * x) / r));
  if (t < r) return up(t);
  if (t > 1 - r) return 1 - up(1 - t);
  return v * (r / 2 + (t - r));
}

// A critically damped spring toward `target`. It starts from rest instead of
// leaping off at full speed the way `x += (target - x) * k` does.
// Returns the new [x, v]; `w` sets the pace (higher is quicker).
export function spring(x, v, target, w, dt) {
  const h = Math.min(dt, 0.05);
  const a = w * w * (target - x) - 2 * w * v;
  v += a * h;
  x += v * h;
  return [x, v];
}
