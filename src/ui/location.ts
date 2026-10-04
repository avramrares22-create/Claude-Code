/**
 * One shared GPS watch for the whole app (map dot, recording, navigation),
 * plus a screen wake lock so iOS doesn't sleep mid-ride.
 */
export interface Fix {
  lng: number;
  lat: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  time: number;
}

type Listener = (f: Fix) => void;

class Location {
  private watchId: number | null = null;
  private listeners = new Set<Listener>();
  private errorListeners = new Set<(msg: string) => void>();
  last: Fix | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.ensure();
    if (this.last) fn(this.last);
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) this.stop();
    };
  }

  onError(fn: (msg: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  private ensure() {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      this.errorListeners.forEach((f) => f('Location is not available on this device'));
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.last = {
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          speed: p.coords.speed,
          heading: p.coords.heading,
          time: p.timestamp,
        };
        this.listeners.forEach((f) => f(this.last!));
      },
      (e) => {
        // Brief dropouts (trees, canyons) are normal: only complain if we have had no fix for a while.
        if (e.code !== e.PERMISSION_DENIED && this.last && Date.now() - this.last.time < 20_000) return;
        const msg =
          e.code === e.PERMISSION_DENIED
            ? 'Location permission denied — enable it in Settings › Privacy › Location Services'
            : e.code === e.TIMEOUT
              ? 'Waiting for GPS signal…'
              : 'Location unavailable';
        this.errorListeners.forEach((f) => f(msg));
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  private stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

export const location = new Location();

/** Keeps the screen on while held. Safe to call when unsupported. */
export class WakeLock {
  private lock: { release(): Promise<void> } | null = null;
  private want = false;

  constructor() {
    // iOS drops the lock when the app goes to background; re-acquire on return.
    document.addEventListener('visibilitychange', () => {
      if (this.want && document.visibilityState === 'visible') void this.acquire();
    });
  }

  async acquire() {
    this.want = true;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      this.lock = (await wl?.request('screen')) ?? null;
    } catch {
      // not supported / denied — recording still works while the screen is on
    }
  }

  async release() {
    this.want = false;
    await this.lock?.release().catch(() => {});
    this.lock = null;
  }
}
