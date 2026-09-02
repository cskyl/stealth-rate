# Apps Script backend

Deploy the backend for one study version as follows:

1. Create the study spreadsheet. Add these four tabs, with the exact first-row
   headers shown:

   - `blocks`: `block_id`, `item_order_json`, `n_assigned`, `n_completed`
   - `sessions`: `session_id`, `study`, `block_id`, `pid_hash`, `ua_hash`,
     `started_at`, `finished_at`, `status`, `headphone_check`,
     `completion_code`
   - `events`: `session_id`, `ts`, `type`, `item_id`, `payload_json`
   - `responses`: `session_id`, `item_id`, `task`, `answers_json`, `rt_ms`,
     `replay_count`, `submitted_at`

   Populate `blocks` from the study's `blocks.json`. Copy the study spreadsheet
   ID from its URL; this is the value for `STUDY_SHEET_ID` in step 3.

2. Create a separate private scoring-key spreadsheet. Add one tab named
   `KEY_DO_NOT_SHARE` with this first-row header:
   `item_id`, `cond_id`, `source_id`, `rung`, `role`. Do not publish or share
   this spreadsheet. `Code.gs` never opens or reads it, so it does not need a
   Script Property.

3. Create or open an Apps Script project, paste in `Code.gs`, and set these
   Script Properties under **Project Settings → Script Properties**:

   - `SECRET`: a long random secret kept private
   - `STUDY_SHEET_ID`: the study spreadsheet ID from step 1
   - `MAX_SESSIONS`: the numeric session cap, for example `100`

4. Deploy the project as a web app: **Deploy → New deployment → Web app**;
   execute as **Me** (the deploying account), set access to **Anyone**, and
   click **Deploy**. Authorize the requested spreadsheet permissions. Keep the
   resulting URL ending in `/exec`.

5. In `studies/<study-slug>/study.yaml`, set the Apps Script backend and paste
   the `/exec` URL, for example:

   ```yaml
   backend:
     mode: apps_script
     apps_script_url: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
   ```

6. Test the deployment with a minimal assignment request (replace the URL and
   use a real study slug):

   ```bash
   curl -sS -X POST \
     -H 'Content-Type: text/plain;charset=utf-8' \
     --data '{"op":"assign","study":"sample_synthetic_v0","pid_hash":"smoke_pid","ua_hash":"smoke_ua"}' \
     'https://script.google.com/macros/s/DEPLOYMENT_ID/exec'
   ```

The public client sends JSON as `text/plain`; operations are `assign`, `event`,
`response`, and `complete`. Never put the private scoring key in the study
spreadsheet or in the public study files.
