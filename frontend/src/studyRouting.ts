/** Routing policy for the public Pages entrypoint.
 *
 * Keep this independent from the study app so changing the default cannot
 * alter the old study's assignment, resume, or response handling.
 */
export const AUDIO_STUDY_ID = "human_audio_gain_20260910";
export const ENVIRONMENT_STUDY_ID = "human_audio_environment_20260914";

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

function isAssignmentId(value: string | null, prefix: "A" | "B"): value is string {
  return value !== null && new RegExp(`^${prefix}(?:00[1-9]|0[1-3][0-9]|040)$`).test(value);
}

/** Decide whether the root app should hand off to the frozen audio package. */
export function routeStudy(input: URL | string): StudyRoute {
  const url = typeof input === "string" ? new URL(input, "https://pages.invalid/") : input;
  const study = url.searchParams.get("study");

  if (study !== null && study !== AUDIO_STUDY_ID && study !== ENVIRONMENT_STUDY_ID) return { kind: "legacy" };
  if (study === null && (hasOldIdentifier(url) || [...url.searchParams.keys()]
    .some((key) => !GENERIC_AUDIO_KEYS.has(key.toLowerCase())))) {
    // Unknown query parameters may be invitation/session fields from an old
    // deployment. Keeping the old app is safer than silently losing answers.
    return { kind: "legacy" };
  }

  const assignment = url.searchParams.get("assignment") ?? url.searchParams.get("block");
  const environment = study === null || study === ENVIRONMENT_STUDY_ID;
  const prefix = environment ? "B" : "A";
  const root = environment ? "./audio-study-environments/" : "./audio-study/";
  const path = isAssignmentId(assignment, prefix)
    ? `${root}assignments/${assignment}.html`
    : root;
  return { kind: "audio", path };
}
