# Project skills

Invoke with `/<name>`.

| Skill | What it does |
| --- | --- |
| `/grill-me` | Relentless one-question-at-a-time interview to stress-test a plan or design. |
| `/grill-with-docs` | Same, but writes the outcome into `CONTEXT.md` (glossary) and `docs/adr/` as it goes. |
| `/grilling` | The underlying interview loop. `grill-me` and `grill-with-docs` both delegate to it. |
| `/domain-modeling` | Maintains the glossary + ADRs. Used by `grill-with-docs`. |

`grilling` and `domain-modeling` are dependencies — `grill-me` and `grill-with-docs`
are one-liners that invoke them. Don't delete them.

Vendored from [mattpocock/skills](https://github.com/mattpocock/skills) @ `2ab9580` (MIT).
To pull updates: re-copy `skills/productivity/{grill-me,grilling}` and
`skills/engineering/{grill-with-docs,domain-modeling}` from that repo.

## Not here, but available

`/browse` (gstack headless browser) is installed globally at `~/.claude/skills/browse/`
and already works in this repo — it isn't vendored here because it depends on the
`~/.claude/skills/gstack/bin` toolchain.
