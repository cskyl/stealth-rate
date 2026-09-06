import type { BackendAdapter } from "./backend/types";

export type MediaStatus = "loading" | "ready" | "playing" | "complete" | "error";

export type MediaController = {
  play: () => Promise<void>;
  replay: () => Promise<void>;
  dispose: () => void;
  /** Only exposed to the opt-in local flow test; never used by the public UI. */
  completeForTest: () => void;
};

type MediaOptions = {
  video: HTMLVideoElement;
  src: string;
  itemId: string;
  sessionId: string;
  backend?: BackendAdapter;
  onEnded: (verified: boolean) => void;
  onStatus?: (status: MediaStatus, error?: string) => void;
  onReplay?: (count: number) => void;
};

const SEEK_TOLERANCE_S = 0.35;
const END_TOLERANCE_S = 0.15;

/**
 * Attach a deliberately non-seekable study player. Native controls are
 * disabled and a seek attempt is put back at the last observed playback time.
 * Completion requires a played range starting near zero and reaching the end;
 * an `ended` event by itself is not sufficient.
 */
export function attachMedia(options: MediaOptions): MediaController {
  const { video, src, itemId, sessionId, backend } = options;
  let replayCount = 0;
  let lastTime = 0;
  let playing = false;
  let allowReplaySeek = false;
  let disposed = false;

  video.src = src;
  video.controls = false;
  video.preload = "metadata";
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.setAttribute("aria-label", "Study clip");
  options.onStatus?.("loading");

  const log = (type: string, payload: Record<string, unknown> = {}) => {
    if (backend && sessionId) {
      void backend.event({ session_id: sessionId, type, item_id: itemId, payload }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        options.onStatus?.("error", `Playback event could not be saved: ${message}`);
      });
    }
  };
  const setStatus = (status: MediaStatus, error?: string) => {
    if (!disposed) options.onStatus?.(status, error);
  };
  const onLoadedMetadata = () => {
    lastTime = 0;
    setStatus("ready");
  };
  const onPlay = () => {
    playing = true;
    lastTime = video.currentTime;
    setStatus("playing");
    log("play");
  };
  const onPause = () => {
    playing = false;
  };
  const onTimeUpdate = () => {
    if (playing && !document.hidden) {
      const delta = video.currentTime - lastTime;
      // A large forward jump is a seek, not observed playback. Keep the
      // previous point so the ended check cannot be bypassed by seeking.
      if (delta >= 0 && delta <= 1.5) {
        lastTime = video.currentTime;
      }
    }
  };
  const onSeeking = () => {
    if (allowReplaySeek || !playing) return;
    if (video.currentTime > lastTime + SEEK_TOLERANCE_S) {
      const attemptedTime = video.currentTime;
      const safeTime = lastTime;
      video.currentTime = safeTime;
      log("seek_blocked", { attempted_time_s: attemptedTime, restored_time_s: safeTime });
    }
  };
  const onVisibility = () => {
    if (document.hidden) {
      playing = false;
      log("visibility_hidden");
    } else if (!video.paused) {
      playing = true;
      lastTime = video.currentTime;
      log("visibility_visible");
    }
  };
  const onError = () => {
    playing = false;
    const mediaError = video.error;
    const detail = mediaError ? `Media error ${mediaError.code}` : "Media could not be loaded";
    setStatus("error", detail);
    log("media_error", { message: detail });
  };
  const hasVerifiedPlayback = (): boolean => {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const ranges = video.played;
    if (!ranges || ranges.length === 0) return false;
    for (let index = 0; index < ranges.length; index += 1) {
      if (ranges.start(index) <= END_TOLERANCE_S && ranges.end(index) >= duration - END_TOLERANCE_S) {
        return true;
      }
    }
    return false;
  };
  const onEnded = () => {
    playing = false;
    const verified = hasVerifiedPlayback();
    log("ended", { playback_verified: verified });
    setStatus(verified ? "complete" : "ready");
    options.onEnded(verified);
  };
  const onLoadedData = () => setStatus("ready");

  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("loadeddata", onLoadedData);
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("ended", onEnded);
  video.addEventListener("error", onError);
  document.addEventListener("visibilitychange", onVisibility);

  const play = async () => {
    try {
      await video.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Playback was blocked";
      setStatus("error", message);
      throw error;
    }
  };
  const replay = async () => {
    allowReplaySeek = true;
    try {
      video.currentTime = 0;
    } finally {
      allowReplaySeek = false;
    }
    replayCount += 1;
    lastTime = 0;
    options.onReplay?.(replayCount);
    log("replay", { replay_count: replayCount });
    await play();
  };
  const completeForTest = () => {
    // This is intentionally not wired to production controls. The flow test
    // opts in with ?test=1 and uses this to avoid pretending jsdom can decode MP4.
    options.onEnded(true);
    setStatus("complete");
  };
  const dispose = () => {
    disposed = true;
    video.removeEventListener("loadedmetadata", onLoadedMetadata);
    video.removeEventListener("loadeddata", onLoadedData);
    video.removeEventListener("play", onPlay);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("seeking", onSeeking);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("error", onError);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  return { play, replay, dispose, completeForTest };
}
