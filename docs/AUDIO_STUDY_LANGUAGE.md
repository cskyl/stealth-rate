# Audio study interface languages

The current participant landing page and B/C/D assignment pages offer English
and Simplified Chinese through the **Language / 语言** selector. The preference
is saved separately from study progress. English remains the default; `?lang=zh`
opens Chinese directly, including through the site's root redirect. `?lang=en`
overrides a saved Chinese preference.

The shared `audio-study-environments/ui-language.js` translates display text,
placeholders and accessible labels without replacing form controls or the video
element. Switching languages preserves playback position, selections, comments
and saved answers. Newly rendered questions, validation messages and the final
download screen use the selected language. The script does not translate video
or audio stimuli, comments, assignment IDs, item IDs or exported response values.

The existing protocol versions, local-storage response keys, filenames and
CSV/JSON schema remain unchanged. Language preference storage is optional; the
selector also works when browser storage is unavailable. Landing-page navigation
passes the selected language in the URL.

The deployed HTML includes `ui-language.js` and `ui-language.css` alongside its
original study code. If generating replacement pages from an older frozen
package, retain these asset references and the landing-page language parameter.
Do not regenerate assignments or media for a display-language change.

Focused checks:

```sh
cd frontend
node --test tests/audioLanguage.test.mjs tests/studyRouting.test.mjs
npm run typecheck
npm run build
```

Browser acceptance covers root-to-assignment navigation, real video playback,
switching mid-answer, reload, CSV/JSON downloads, B/C links and a 390-pixel mobile
viewport. Browser test answers are synthetic and must not enter study analysis.
