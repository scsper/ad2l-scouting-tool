## Scripts

- `start` - start dev server and open browser. allows serverless routes to work by running `vercel dev`
- `build` - build for production
- `preview` - locally preview production build
- `test` - launch test runner
- `grant` - add an admin or a division-scoped user, or revoke access. `npm run grant -- --list`
  shows who has what; see `.claude/skills/grant-access/SKILL.md` for the full runbook.

## Helpful Tidbits
#### Sql to remove a match from the database
```
BEGIN TRANSACTION;

DELETE FROM match_player WHERE match_id = 8669782562;
DELETE FROM match_draft WHERE match_id = 8669782562;
DELETE FROM match WHERE id = 8669782562;

COMMIT;
```
