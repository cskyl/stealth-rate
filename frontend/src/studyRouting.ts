/** Routing policy for the public Pages entrypoint.
 *
 * Keep this independent from the study app so changing the default cannot
 * alter the old study's assignment, resume, or response handling.
 */
export const AUDIO_STUDY_ID = "human_audio_gain_20260910";
export const ENVIRONMENT_STUDY_ID = "human_audio_environment_20260914";
export const ENVIRONMENT_N60_STUDY_ID = "human_audio_environment_20260918_n60";
export const ENVIRONMENT_CONTROLS_STUDY_ID = "human_audio_environment_20260918_controls";

export type StudyRoute =
  | { kind: "legacy" }
  | { kind: "audio"; path: string };

// These are the identifiers used by the old Prolific/invitation flow. The
// comparison is case-insensitive because participant links are external.
const OLD_ID_KEYS = new Set([
  "invite",
  "invitetoken",
  "session",
  "session_id",
  "sessionid",
  "prolific_pid",
  "prolificpid",
  "study_id",
  "studyid",
  "pid",
  "participant",
  "participant_id",
  "participantid",
  "workerid",
  "assignmentid",
  "submissionid",
]);
const GENERIC_AUDIO_KEYS = new Set(["guide", "lang", "language"]);

function hasOldIdentifier(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (OLD_ID_KEYS.has(key.toLowerCase())) return true;
  }
  // The original app accepts invitations in the hash. Preserve any such
  // link, including malformed/incomplete links, for its own error handling.
  return /(?:^|[#&])(?:invite|block)=/i.test(url.hash);
}

function isAssignmentId(value: string | null, prefix: "A" | "B" | "C" | "D", max: 40 | 80): value is string {
  if (value === null || value !== value.toUpperCase()) return false;
  const number = Number(value.slice(1));
  return value.startsWith(prefix) && Number.isInteger(number) && number >= 1 && number <= max
    && value === `${prefix}${String(number).padStart(3, "0")}`;
}

/** Decide whether the root app should hand off to the frozen audio package. */
export function routeStudy(input: URL | string): StudyRoute {
  const url = typeof input === "string" ? new URL(input, "https://pages.invalid/") : input;
  const study = url.searchParams.get("study");

  if (study !== null && study !== AUDIO_STUDY_ID && study !== ENVIRONMENT_STUDY_ID && study !== ENVIRONMENT_N60_STUDY_ID && study !== ENVIRONMENT_CONTROLS_STUDY_ID) return { kind: "legacy" };
  if (study === null) {
    const assignment = url.searchParams.get("assignment") ?? url.searchParams.get("block");
    const unknownQuery = [...url.searchParams.keys()].some((key) => {
      const normalized = key.toLowerCase();
      return !GENERIC_AUDIO_KEYS.has(normalized) && normalized !== "assignment" && normalized !== "block";
    });
    if (hasOldIdentifier(url) || unknownQuery || (assignment !== null && !isAssignmentId(assignment, "C", 80) && !isAssignmentId(assignment, "D", 80))) {
      // Unknown query parameters may be invitation/session fields from an old
      // deployment. Keeping the old app is safer than silently losing answers.
      return { kind: "legacy" };
    }
  }

  const assignment = url.searchParams.get("assignment") ?? url.searchParams.get("block");
  if (study === ENVIRONMENT_STUDY_ID) {
    return {
      kind: "audio",
      path: isAssignmentId(assignment, "B", 40)
        ? `./audio-study-environments/assignments/${assignment}.html`
        : "./audio-study-environments/legacy-b.html",
    };
  }
  if (study === AUDIO_STUDY_ID) {
    return {
      kind: "audio",
      path: isAssignmentId(assignment, "A", 40)
        ? `./audio-study/assignments/${assignment}.html`
        : "./audio-study/",
    };
  }

  if (study === ENVIRONMENT_N60_STUDY_ID) {
    return {
      kind: "audio",
      path: isAssignmentId(assignment, "C", 80)
        ? `./audio-study-environments/assignments/${assignment}.html`
        : "./audio-study-environments/legacy-c.html",
    };
  }

  if (study === ENVIRONMENT_CONTROLS_STUDY_ID) {
    return {
      kind: "audio",
      path: isAssignmentId(assignment, "D", 80)
        ? `./audio-study-environments/assignments/${assignment}.html`
        : "./audio-study-environments/",
    };
  }

  // Published unqualified C links remain on the C package. The new default is
  // the controls package, while the explicit n=60 C study is handled above.
  return {
    kind: "audio",
    path: isAssignmentId(assignment, "C", 80)
      ? `./audio-study-environments/assignments/${assignment}.html`
      : isAssignmentId(assignment, "D", 80)
        ? `./audio-study-environments/assignments/${assignment}.html`
        : "./audio-study-environments/",
  };
}
