// tokenlog.js — shared helper for the AI token-spend/utilization tracker.
// Both server.js and knowledge.js spawn the local `claude` CLI with
// --output-format json; this module parses that wrapper JSON and fire-and-forgets
// a usage row into Mongo (tokenUsage) so logging can never slow down or break
// an answer. Kept as its own file so the parsing/logging logic is identical in
// both call sites instead of hand-copied twice.

// Parse the CLI's --output-format json stdout. Returns the parsed object (with
// a string `.result`) on success, or null so the caller can fall back to
// treating stdout as plain text exactly like before this feature existed.
function parseCliJson(stdout) {
  try {
    const parsed = JSON.parse(String(stdout || "").trim());
    if (parsed && typeof parsed === "object" && typeof parsed.result === "string") return parsed;
  } catch (_error) {
    // not JSON (older CLI, a crash mid-stream, etc.) - caller falls back to raw text
  }
  return null;
}

// Fire-and-forget insert into the `tokenUsage` collection. Never throws, never
// awaited by the caller's response path - a logging failure must never break
// or delay an answer.
function logTokenUsage(collection, { feature, model, parsed, ok, durationMs }) {
  Promise.resolve()
    .then(async () => {
      const coll = await collection("tokenUsage");
      if (!coll) return;
      const usage = (parsed && parsed.usage) || {};
      await coll.insertOne({
        at: new Date().toISOString(),
        feature: String(feature || "unknown"),
        model: String(model || "unknown"),
        inputTokens: Number(usage.input_tokens || 0),
        outputTokens: Number(usage.output_tokens || 0),
        cacheReadTokens: Number(usage.cache_read_input_tokens || 0),
        cacheCreateTokens: Number(usage.cache_creation_input_tokens || 0),
        costUsd: Number((parsed && parsed.total_cost_usd) || 0),
        numTurns: Number((parsed && parsed.num_turns) || 0),
        durationMs: Number((parsed && parsed.duration_ms) || durationMs || 0),
        ok: ok !== false && !(parsed && parsed.is_error)
      });
    })
    .catch(() => { /* logging must never break the caller */ });
}

module.exports = { parseCliJson, logTokenUsage };
