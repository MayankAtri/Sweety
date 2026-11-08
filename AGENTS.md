# Sweety agent instructions

1. Read spec.md and current_work.md, then inspect git status before changes.
2. Implement only the authorized phase. Current scope: foundation and APIs; React UI is deferred.
3. Other agents may be editing this checkout. Respect assigned file ownership; never revert others' work. Coordinate shared contracts with the lead.
4. Each agent MUST append its own completion/handoff entry to current_work.md before finishing, using an explicit Asia/Kolkata timestamp. Include files, decisions, exact checks/results, limitations and next steps. Never erase earlier entries.
5. Lead alone stages, commits, pushes or manages GitHub. User authorized incremental pushes to MayankAtri/Sweety. Never commit secrets, .env, local database files or dependencies.
6. Use parameterized SQL, enforce per-user ownership and preserve database constraints. Test real PostgreSQL behavior; mocked queries do not establish integration acceptance.
7. Keep code readable and proportionate to a fresher assignment. Document assumptions instead of adding speculative features.
