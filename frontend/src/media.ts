import type { BackendAdapter } from "./backend/types";

export type MediaController = {
  play: () => Promise<void>;
  replay: () => Promise<void>;
  dispose: () => void;
};

type MediaOptions = {
  video: HTMLVideoElement;
  src: string;
  itemId: string;
  sessionId: string;
  backend: BackendAdapter;
  onEnded: () => void;
  onReplay: (count: number) => void;
};

export function attachMedia(options: MediaOptions): MediaController {
  const { video, src, itemId, sessionId, backend } = options;
  let replayCount = 0;
  let visibleSince = 0;
  let visiblePlayback = 0;
  let lastTime = 0;
  video.src = src;
  video.controls = false;
  video.preload = "metadata";
  video.playsInline = true;

  const log = (type: string, payload: Record<string, unknown> = {}) => {
    void backend.event({ session_id: sessionId, type, item_id: itemId, payload });
  };
  const onPlay = () => {
    visibleSince = performance.now();
    lastTime = video.currentTime;
    log("play");
  };
  const onTimeUpdate = () => {
    if (!document.hidden && visibleSince) {
      visiblePlayback += Math.max(0, video.currentTime - lastTime) * 1000;
    }
    lastTime = video.currentTime;
  };
  const onEnded = () => {
    if (visibleSince) {
      visiblePlayback += Math.max(0, video.currentTime - lastTime) * 1000;
    }
    log("ended", { visible_playback_ms: Math.round(visiblePlayback) });
    options.onEnded();
  };
  const onVisibility = () => {
    if (document.hidden) {
      visibleSince = 0;
      log("visibility_hidden", { visible_playback_ms: Math.round(visiblePlayback) });
    } else {
      visibleSince = performance.now();
      lastTime = video.currentTime;
      log("visibility_visible", { visible_playback_ms: Math.round(visiblePlayback) });
    }
  };
  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("ended", onEnded);
  document.addEventListener("visibilitychange", onVisibility);

  const play = async () => {
    await video.play();
  };
  const replay = async () => {
    video.currentTime = 0;
    replayCount += 1;
    log("replay", { replay_count: replayCount });
    options.onReplay(replayCount);
    await play();
  };
  const dispose = () => {
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.removeEventListener("ended", onEnded);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  return { play, replay, dispose };
}

