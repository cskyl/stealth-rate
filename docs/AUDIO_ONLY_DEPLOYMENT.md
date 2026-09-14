# Audio-only Pages routing

The public root now defaults to the frozen `audio-study/` participant package.
An explicit `study=human_audio_gain_20260910` link uses the same package;
`assignment=A001` (or `block=A001`) through `A040` opens that static assignment
page. Existing study slugs and invitation/session links remain on the legacy
frontend, including unknown query parameters when no study is specified, so a
participant link cannot silently lose its resume or response context.

The Pages workflow copies `audio-study/` as a separate public subtree. It must
contain only the participant package (index, assignments, and media); private
keys and source artifacts are rejected by the assembly guard. Deployment and
live verification are intentionally outside this routing change.
