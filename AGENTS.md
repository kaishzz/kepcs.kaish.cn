## KepCs Project Conventions

These rules apply to the `E:\GitHubProjects\WebSite\kepcs.kaish.cn` workspace.

## Common Requirements

- Before working in this project, first read the shared requirements file at `E:\GitHubProjects\andrej-karpathy-skills\EXAMPLES.md`.
- Treat `E:\GitHubProjects\andrej-karpathy-skills\EXAMPLES.md` as the common baseline instruction set for this project.
- Apply the shared requirements first, then apply the KepCs-specific rules in this file.
- If a shared requirement conflicts with an explicit rule in this file, follow this file for work inside `E:\GitHubProjects\WebSite\kepcs.kaish.cn`.
- Do not duplicate the full example content here; the external `EXAMPLES.md` is the source of truth.

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
- In this repo, the primary mapping is `.env.example` -> `.env`.
- If `server_upload/.env` exists, keep it aligned with the root `.env` as part of the same sync pass.
- When an example file adds keys, add the missing keys to the real file.
- When an example file removes obsolete keys, remove the corresponding keys from the real file only if they are part of that same mirrored structure.
- When an example file renames or restructures keys, apply the same key-name change to the real file while preserving the user's existing values whenever possible.
- Never overwrite existing secret values just because the example file changed.
- Never print secret values unless the user explicitly asks.
- If a real file does not exist, mention it and do not create it unless the task requires it.

### Completion Checks

- Before wrapping up a website task, verify the main project and `server_upload/` are synchronized for the files touched in the task.
- Mention clearly whether `server_upload/` was synced and whether example files were checked against real files.
