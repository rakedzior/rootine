# Backfill materializer boundary

The executable is intentionally the operator-only
`supabase/scripts/backfill-materializer.ts` command. There is no public Edge
Function for backfill: the script uses the service role and invokes the
allow-listed SQL RPCs. Keep this directory as the deployment boundary for a
future private job if the hosting environment adds one; do not expose the
service-role RPC through an authenticated client endpoint.
