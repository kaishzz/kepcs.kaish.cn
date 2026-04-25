## KepCs Project Conventions

These rules apply to the `E:\GitHubProjects\WebSite\kepcs.kaish.cn` workspace.

## Common Requirements

- Before working in this project, first read the shared requirements file at `C:\Users\24854\.codex\AGENTS.md`.
- Treat `C:\Users\24854\.codex\AGENTS.md` as the common baseline instruction set for this project.
- Apply the shared requirements first, then apply the KepCs-specific rules in this file.
- If a shared requirement conflicts with an explicit rule in this file, follow this file for work inside `E:\GitHubProjects\WebSite\kepcs.kaish.cn`.
- Do not duplicate the shared baseline content here; `C:\Users\24854\.codex\AGENTS.md` is the source of truth for it.

### Canonical Path

- This repository's canonical local path is `E:\GitHubProjects\WebSite\kepcs.kaish.cn`.
- If another workspace references `kepcs` or `kepcs.kaish.cn`, assume it means this path unless the user explicitly says otherwise.

### Companion Repository

- The companion agent repository for this project is `E:\GitHubProjects\KepRepository\KepAgent`.
- When a task involves agent behavior, RCON execution, node command handling, agent config, container startup, or website-to-agent integration, inspect and update the companion repo directly instead of asking for the path again.
- If a website change depends on a KepAgent change, treat it as a cross-repo task by default unless the user explicitly says to keep it website-only.

### Deployment Mirror

- `server_upload/` is the deployment mirror of the main project.
- After changing deployable website files, also sync the corresponding files and build output into `server_upload/` before finishing, unless the user explicitly says not to.
- Treat `dist/` and `server_upload/dist/` as a matched pair. If a new build creates new asset filenames, remove stale files from `server_upload/dist/` so the mirror stays clean.
- Prefer using the repo sync script when available instead of ad-hoc copying.

### Example File Sync

- Example files and real files must stay structurally aligned.
- In this repo, the primary mappings are `.env.example` -> `.env` and `server_upload/.env.example` -> `server_upload/.env`.
- Keep `server_upload/.env` aligned with the root `.env` as part of the same sync pass when the deployment mirror exists.
- When an example file adds keys, fields, or variables, add the missing ones to the real file.
- When an example file removes obsolete keys or fields, remove the corresponding entries from the real file only if they are part of that same mirrored structure.
- When an example file renames or restructures keys or fields, apply the same name and structure changes to the real file while preserving the user's existing values whenever possible.
- Sync names, structure, and expected keys, but do not overwrite existing secrets, tokens, passwords, URLs, paths, or other user data unless explicitly asked.
- Never replace real values with example placeholder values just because the example file changed.
- Never print secret values unless the user explicitly asks.
- If a real file does not exist, mention it and do not create it unless the task requires it.

### Completion Checks

- Before wrapping up a website task, verify the main project and `server_upload/` are synchronized for the files touched in the task.
- Mention clearly whether `server_upload/` was synced and whether example files were checked against real files.
