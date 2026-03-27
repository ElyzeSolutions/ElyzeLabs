export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    sql: `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  chat_type TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  state TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  runtime TEXT NOT NULL,
  prompt TEXT NOT NULL,
  result_summary TEXT,
  error TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_session_status ON runs(session_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  details TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_ts ON run_events(run_id, ts DESC);

CREATE TABLE IF NOT EXISTS queue_items (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TEXT NOT NULL,
  lease_expires_at TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_queue_ready ON queue_items(status, lane, available_at, priority);
CREATE INDEX IF NOT EXISTS idx_queue_session_status ON queue_items(session_id, status);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pairing_requests (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_handle TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pairing_sender_unique ON pairing_requests(channel, sender_id);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  agent_id TEXT NOT NULL,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding_ref TEXT,
  importance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_memory_agent_created ON memory_items(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  path TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  details_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts DESC);

CREATE TABLE IF NOT EXISTS realtime_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  lane TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_realtime_sequence ON realtime_events(sequence);

CREATE TABLE IF NOT EXISTS office_presence (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  run_id TEXT,
  state TEXT NOT NULL,
  activity_label TEXT,
  sequence INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agent_id, session_id)
);

CREATE TABLE IF NOT EXISTS office_layouts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  tiles_json TEXT NOT NULL,
  furniture_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_gate_results (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifacts_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remediation_tasks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
  },
  {
    id: '002_session_preferences_and_tools',
    sql: `
ALTER TABLE sessions ADD COLUMN preferred_runtime TEXT;
ALTER TABLE sessions ADD COLUMN preferred_model TEXT;

ALTER TABLE runs ADD COLUMN requested_runtime TEXT;
ALTER TABLE runs ADD COLUMN requested_model TEXT;
ALTER TABLE runs ADD COLUMN effective_runtime TEXT;
ALTER TABLE runs ADD COLUMN effective_model TEXT;
ALTER TABLE runs ADD COLUMN trigger_source TEXT;
ALTER TABLE runs ADD COLUMN supersedes_run_id TEXT;

ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'system';

CREATE TABLE IF NOT EXISTS tools (
  name TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  installed INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

UPDATE runs
SET requested_runtime = COALESCE(requested_runtime, runtime),
    effective_runtime = COALESCE(effective_runtime, runtime),
    trigger_source = COALESCE(trigger_source, 'legacy');

UPDATE messages
SET source = CASE
  WHEN channel = 'telegram' THEN 'telegram'
  ELSE 'api'
END
WHERE source IS NULL OR source = '';
`
  },
  {
    id: '003_alignment_memory_remediation_vault',
    sql: `
CREATE TABLE IF NOT EXISTS trajectory_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  chapter TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  tool_name TEXT,
  decision TEXT,
  content TEXT NOT NULL,
  significance REAL NOT NULL DEFAULT 0,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  sequence INTEGER NOT NULL UNIQUE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trajectory_events_run_sequence ON trajectory_events(run_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_trajectory_events_session_sequence ON trajectory_events(session_id, sequence ASC);

CREATE TABLE IF NOT EXISTS trajectory_chapters (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  chapter_key TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  summary TEXT NOT NULL,
  significance REAL NOT NULL DEFAULT 0,
  first_sequence INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, chapter_key),
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trajectory_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  latest_sequence INTEGER NOT NULL,
  chapter_count INTEGER NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS context_graph_nodes (
  id TEXT PRIMARY KEY,
  node_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_graph_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  action TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(from_node_id, to_node_id, action),
  FOREIGN KEY(from_node_id) REFERENCES context_graph_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY(to_node_id) REFERENCES context_graph_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_context_graph_edges_from ON context_graph_edges(from_node_id, weight DESC);

CREATE TABLE IF NOT EXISTS remediation_signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  blast_radius TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remediation_signals_status ON remediation_signals(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remediation_signals_key ON remediation_signals(signal_key, created_at DESC);

CREATE TABLE IF NOT EXISTS remediation_plans (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  priority INTEGER NOT NULL,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  policy_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  executed_at TEXT,
  FOREIGN KEY(signal_id) REFERENCES remediation_signals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remediation_plans_status ON remediation_plans(status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS remediation_outcomes (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  effectiveness_score REAL NOT NULL DEFAULT 0,
  recurrence_delta REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES remediation_plans(id) ON DELETE CASCADE,
  FOREIGN KEY(signal_id) REFERENCES remediation_signals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_remediation_outcomes_signal ON remediation_outcomes(signal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vault_key_versions (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  wrapped_key TEXT NOT NULL,
  wrap_nonce TEXT NOT NULL,
  wrap_aad TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  rotated_from INTEGER,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vault_key_versions_status ON vault_key_versions(status, version DESC);

CREATE TABLE IF NOT EXISTS vault_secrets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  cipher_nonce TEXT NOT NULL,
  cipher_aad TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  wrapped_nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY(key_version) REFERENCES vault_key_versions(version)
);

CREATE INDEX IF NOT EXISTS idx_vault_secrets_category ON vault_secrets(category, updated_at DESC);
`
  },
  {
    id: '004_agent_profiles_and_delegation',
    sql: `
CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  parent_agent_id TEXT,
  system_prompt TEXT NOT NULL,
  default_runtime TEXT NOT NULL,
  default_model TEXT,
  allowed_runtimes_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  tools_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_agent_id) REFERENCES agent_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_enabled ON agent_profiles(enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_parent ON agent_profiles(parent_agent_id, updated_at DESC);
`
  },
  {
    id: '005_llm_cost_governance',
    sql: `
CREATE TABLE IF NOT EXISTS llm_usage_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  month_utc TEXT NOT NULL,
  run_id TEXT,
  session_id TEXT,
  runtime TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  cost_confidence TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_ts ON llm_usage_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider_day ON llm_usage_events(provider, day_utc, status);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider_month ON llm_usage_events(provider, month_utc, status);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider_minute ON llm_usage_events(provider, ts, status);
CREATE INDEX IF NOT EXISTS idx_llm_usage_model_day ON llm_usage_events(provider, model, day_utc, status);
CREATE INDEX IF NOT EXISTS idx_llm_usage_run_attempt ON llm_usage_events(run_id, attempt);

CREATE TABLE IF NOT EXISTS llm_limits (
  id TEXT PRIMARY KEY,
  limits_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS llm_usage_daily_rollup AS
SELECT
  day_utc,
  provider,
  model,
  task_type,
  COUNT(*) AS call_count,
  SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked_count,
  SUM(COALESCE(cost_usd, 0)) AS cost_usd
FROM llm_usage_events
GROUP BY day_utc, provider, model, task_type;

CREATE VIEW IF NOT EXISTS llm_usage_monthly_rollup AS
SELECT
  month_utc,
  provider,
  model,
  task_type,
  COUNT(*) AS call_count,
  SUM(CASE WHEN status = 'blocked_budget' THEN 1 ELSE 0 END) AS blocked_count,
  SUM(COALESCE(cost_usd, 0)) AS cost_usd
FROM llm_usage_events
GROUP BY month_utc, provider, model, task_type;
`
  },
  {
    id: '006_terminal_streaming',
    sql: `
CREATE TABLE IF NOT EXISTS run_terminals (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  runtime TEXT NOT NULL,
  mode TEXT NOT NULL,
  mux_session_id TEXT,
  workspace_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_offset INTEGER NOT NULL DEFAULT 0,
  retention_until TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_terminals_session_status ON run_terminals(session_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS run_terminal_chunks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  offset INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'stdout',
  created_at TEXT NOT NULL,
  UNIQUE(run_id, offset),
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_terminal_chunks_run_offset ON run_terminal_chunks(run_id, offset ASC);
`
  },
  {
    id: '007_backlog_orchestration_and_github_delivery',
    sql: `
CREATE TABLE IF NOT EXISTS backlog_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  labels_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'dashboard',
  source_ref TEXT,
  created_by TEXT NOT NULL DEFAULT 'operator',
  assigned_agent_id TEXT,
  linked_session_id TEXT,
  linked_run_id TEXT,
  blocked_reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(assigned_agent_id) REFERENCES agent_profiles(id),
  FOREIGN KEY(linked_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY(linked_run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_items_state_priority ON backlog_items(state, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlog_items_agent_state ON backlog_items(assigned_agent_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS backlog_transitions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES backlog_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backlog_transitions_item_created ON backlog_transitions(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backlog_dependencies (
  item_id TEXT NOT NULL,
  depends_on_item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(item_id, depends_on_item_id),
  FOREIGN KEY(item_id) REFERENCES backlog_items(id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_item_id) REFERENCES backlog_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backlog_dependencies_item ON backlog_dependencies(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backlog_orchestration (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  paused INTEGER NOT NULL DEFAULT 1,
  max_parallel INTEGER NOT NULL DEFAULT 2,
  wip_limit INTEGER NOT NULL DEFAULT 3,
  escalation_mode TEXT NOT NULL DEFAULT 'notify',
  last_tick_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backlog_orchestration_decisions (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES backlog_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_orchestration_decisions_created ON backlog_orchestration_decisions(created_at DESC);

CREATE TABLE IF NOT EXISTS github_repo_connections (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  auth_secret_ref TEXT NOT NULL,
  webhook_secret_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_github_repo_connections_enabled ON github_repo_connections(enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS backlog_delivery_links (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE,
  repo_connection_id TEXT,
  branch_name TEXT,
  commit_sha TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  checks_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES backlog_items(id) ON DELETE CASCADE,
  FOREIGN KEY(repo_connection_id) REFERENCES github_repo_connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backlog_delivery_links_status ON backlog_delivery_links(status, updated_at DESC);
`
  },
  {
    id: '008_llm_provider_namespace_cleanup',
    sql: `
DELETE FROM llm_usage_events
WHERE provider NOT IN ('openrouter', 'google');
`
  },
  {
    id: '009_skill_installer_memory_embeddings_and_delivery_provenance',
    sql: `
CREATE TABLE IF NOT EXISTS skill_catalog_operations (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  source_ref TEXT,
  actor TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_operations_created ON skill_catalog_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_catalog_operations_action ON skill_catalog_operations(action, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_item_id TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL DEFAULT 0,
  vector_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(memory_item_id) REFERENCES memory_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_checksum ON memory_embeddings(checksum, provider, model);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_status ON memory_embeddings(status, updated_at DESC);

ALTER TABLE backlog_items ADD COLUMN origin_session_id TEXT;
ALTER TABLE backlog_items ADD COLUMN origin_message_id TEXT;
ALTER TABLE backlog_items ADD COLUMN origin_channel TEXT;
ALTER TABLE backlog_items ADD COLUMN origin_chat_id TEXT;
ALTER TABLE backlog_items ADD COLUMN origin_topic_id TEXT;

ALTER TABLE backlog_delivery_links ADD COLUMN receipt_status TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN receipt_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE backlog_delivery_links ADD COLUMN receipt_last_error TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN receipt_last_attempt_at TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN workspace_root TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN workspace_path TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN output_files_json TEXT NOT NULL DEFAULT '[]';
`
  },
  {
    id: '010_skill_catalog_sqlite_entries',
    sql: `
CREATE TABLE IF NOT EXISTS skill_catalog_entries (
  path TEXT PRIMARY KEY,
  name TEXT,
  enabled INTEGER,
  requires_approval INTEGER,
  supports_dry_run INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  allowed_commands_json TEXT NOT NULL DEFAULT '[]',
  required_tools_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_catalog_entries_updated ON skill_catalog_entries(updated_at DESC);
`
  },
  {
    id: '011_runtime_config_sqlite_overlay',
    sql: `
CREATE TABLE IF NOT EXISTS runtime_config_state (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
  },
  {
    id: '012_onboarding_state',
    sql: `
CREATE TABLE IF NOT EXISTS onboarding_state (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
  },
  {
    id: '013_backlog_project_scope',
    sql: `
ALTER TABLE backlog_items ADD COLUMN project_id TEXT;
ALTER TABLE backlog_items ADD COLUMN repo_root TEXT;

CREATE INDEX IF NOT EXISTS idx_backlog_items_project_state ON backlog_items(project_id, state, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlog_items_repo_state ON backlog_items(repo_root, state, priority DESC, updated_at DESC);
`
  },
  {
    id: '014_context_assembly_and_continuity_signals',
    sql: `
CREATE TABLE IF NOT EXISTS prompt_assembly_snapshots (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  context_limit INTEGER NOT NULL,
  total_estimated_tokens INTEGER NOT NULL,
  overflow_strategy TEXT NOT NULL,
  overflowed INTEGER NOT NULL DEFAULT 0,
  continuity_coverage_json TEXT NOT NULL DEFAULT '{}',
  segments_json TEXT NOT NULL DEFAULT '[]',
  dropped_segments_json TEXT NOT NULL DEFAULT '[]',
  prompt_preview TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompt_assembly_snapshots_session ON prompt_assembly_snapshots(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS continuity_signals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  session_id TEXT,
  severity TEXT NOT NULL,
  source TEXT NOT NULL,
  code TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_continuity_signals_status_created ON continuity_signals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_signals_run ON continuity_signals(run_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_continuity_signals_dedupe_status ON continuity_signals(dedupe_key, status);
`
  },
  {
    id: '015_execution_contracts_and_dispatches',
    sql: `
CREATE TABLE IF NOT EXISTS execution_contracts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'runtime_output',
  status TEXT NOT NULL DEFAULT 'parsed',
  contract_json TEXT NOT NULL DEFAULT '{}',
  parse_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_execution_contracts_session_status ON execution_contracts(session_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_contracts_updated ON execution_contracts(updated_at DESC);

CREATE TABLE IF NOT EXISTS execution_contract_dispatches (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'dispatch_subrun',
  target_agent_id TEXT,
  target_session_id TEXT,
  delegated_run_id TEXT,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(contract_id) REFERENCES execution_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(target_agent_id) REFERENCES agent_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY(target_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY(delegated_run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_contract_dispatches_contract ON execution_contract_dispatches(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_contract_dispatches_run ON execution_contract_dispatches(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_contract_dispatches_task ON execution_contract_dispatches(contract_id, task_id, created_at DESC);
`
  },
  {
    id: '016_watchdog_reasoning_deliverygroup_ops',
    sql: `
ALTER TABLE sessions ADD COLUMN preferred_reasoning_effort TEXT;

ALTER TABLE runs ADD COLUMN requested_reasoning_effort TEXT;
ALTER TABLE runs ADD COLUMN effective_reasoning_effort TEXT;

ALTER TABLE backlog_items ADD COLUMN delivery_group_id TEXT;

CREATE TABLE IF NOT EXISTS delivery_groups (
  id TEXT PRIMARY KEY,
  source_ref TEXT,
  repo_connection_id TEXT,
  target_branch TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  commit_sha TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repo_connection_id) REFERENCES github_repo_connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_groups_status_updated ON delivery_groups(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_backlog_items_delivery_group ON backlog_items(delivery_group_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS watchdog_config (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watchdog_history (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  detected_pattern TEXT,
  matched_signature TEXT,
  recommendation TEXT NOT NULL,
  action TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watchdog_history_run_created ON watchdog_history(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchdog_history_created ON watchdog_history(created_at DESC);

CREATE TABLE IF NOT EXISTS compounding_learnings (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  category TEXT NOT NULL,
  insight TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  significance INTEGER NOT NULL DEFAULT 1,
  applied INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compounding_learnings_agent_created ON compounding_learnings(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compounding_learnings_agent_significance ON compounding_learnings(agent_id, significance DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS improvement_proposals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  proposed_changes_json TEXT NOT NULL DEFAULT '[]',
  reasoning TEXT NOT NULL,
  learning_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  operator_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_improvement_proposals_agent_status ON improvement_proposals(agent_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS local_claude_sessions (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'unknown',
  branch TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  tool_use_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  last_user_prompt TEXT,
  last_message_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_claude_sessions_active ON local_claude_sessions(active, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_claude_sessions_project ON local_claude_sessions(project_slug, updated_at DESC);

CREATE TABLE IF NOT EXISTS local_claude_scan_offsets (
  file_path TEXT PRIMARY KEY,
  offset INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cron_run_history (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cron_run_history_job_created ON cron_run_history(job_name, created_at DESC);

CREATE TABLE IF NOT EXISTS startup_healer_audit (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`
  },
  {
    id: '017_local_runtime_sessions',
    sql: `
CREATE TABLE IF NOT EXISTS local_runtime_sessions (
  id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'unknown',
  branch TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  tool_use_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  last_user_prompt TEXT,
  last_message_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_runtime_sessions_active ON local_runtime_sessions(active, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_runtime_sessions_runtime ON local_runtime_sessions(runtime, active, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_runtime_sessions_project ON local_runtime_sessions(project_slug, updated_at DESC);

CREATE TABLE IF NOT EXISTS local_runtime_scan_offsets (
  runtime TEXT NOT NULL,
  file_path TEXT NOT NULL,
  offset INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(runtime, file_path)
);

INSERT OR IGNORE INTO local_runtime_sessions (
  id, runtime, project_slug, file_path, model, branch, input_tokens, output_tokens, cache_read_input_tokens,
  cache_creation_input_tokens, tool_use_count, message_count, estimated_cost_usd, active, last_user_prompt,
  last_message_at, details_json, updated_at
)
SELECT
  id, 'claude', project_slug, file_path, model, branch, input_tokens, output_tokens, cache_read_input_tokens,
  cache_creation_input_tokens, tool_use_count, message_count, estimated_cost_usd, active, last_user_prompt,
  last_message_at, details_json, updated_at
FROM local_claude_sessions;

INSERT OR IGNORE INTO local_runtime_scan_offsets (runtime, file_path, offset, updated_at)
SELECT 'claude', file_path, offset, updated_at
FROM local_claude_scan_offsets;
`
  },
  {
    id: '018_watchdog_recovery_jobs',
    sql: `
CREATE TABLE IF NOT EXISTS watchdog_recovery_jobs (
  id TEXT PRIMARY KEY,
  root_run_id TEXT NOT NULL,
  trigger_run_id TEXT NOT NULL,
  replacement_run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  queue_item_id TEXT,
  action TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  status_reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(root_run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(trigger_run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(replacement_run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(queue_item_id) REFERENCES queue_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_watchdog_recovery_jobs_root_status_due
  ON watchdog_recovery_jobs(root_run_id, status, due_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchdog_recovery_jobs_queue_item
  ON watchdog_recovery_jobs(queue_item_id);
CREATE INDEX IF NOT EXISTS idx_watchdog_recovery_jobs_replacement
  ON watchdog_recovery_jobs(replacement_run_id, status, due_at DESC);
`
  },
  {
    id: '019_github_trust_contracts',
    sql: `
ALTER TABLE github_repo_connections ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'pat_fallback';
ALTER TABLE github_repo_connections ADD COLUMN app_installation_id INTEGER;
ALTER TABLE github_repo_connections ADD COLUMN app_installation_account_login TEXT;
ALTER TABLE github_repo_connections ADD COLUMN permission_manifest_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE github_repo_connections ADD COLUMN permission_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE github_repo_connections ADD COLUMN token_expires_at TEXT;
ALTER TABLE github_repo_connections ADD COLUMN last_validated_at TEXT;
ALTER TABLE github_repo_connections ADD COLUMN last_validation_status TEXT;
ALTER TABLE github_repo_connections ADD COLUMN last_validation_error TEXT;
ALTER TABLE github_repo_connections ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'policy.v1';
ALTER TABLE github_repo_connections ADD COLUMN policy_hash TEXT;
ALTER TABLE github_repo_connections ADD COLUMN policy_source TEXT NOT NULL DEFAULT 'control_plane';
ALTER TABLE github_repo_connections ADD COLUMN policy_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  repo_connection_id TEXT,
  event TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  source TEXT NOT NULL,
  signature_state TEXT NOT NULL,
  signature_fingerprint TEXT,
  status TEXT NOT NULL,
  replay_of_delivery_id TEXT,
  reason TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repo_connection_id) REFERENCES github_repo_connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_repo_created
  ON github_webhook_deliveries(repo_connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_webhook_deliveries_status_updated
  ON github_webhook_deliveries(status, updated_at DESC);
`
  },
  {
    id: '020_github_delivery_contracts',
    sql: `
ALTER TABLE backlog_delivery_links ADD COLUMN github_state TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN github_state_reason TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN github_state_updated_at TEXT;
ALTER TABLE backlog_delivery_links ADD COLUMN github_lease_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE backlog_delivery_links ADD COLUMN github_worktree_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE backlog_delivery_links ADD COLUMN github_reconcile_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_backlog_delivery_links_github_state
  ON backlog_delivery_links(github_state, updated_at DESC);
`
  },
  {
    id: '021_schedule_registry',
    sql: `
CREATE TABLE IF NOT EXISTS schedule_jobs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,
  cadence_kind TEXT NOT NULL,
  cadence TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1,
  paused_at TEXT,
  paused_by TEXT,
  requested_by TEXT,
  requesting_session_id TEXT,
  origin_ref_json TEXT NOT NULL DEFAULT '{}',
  target_agent_id TEXT,
  session_target TEXT NOT NULL DEFAULT 'origin_session',
  delivery_target TEXT NOT NULL DEFAULT 'origin_session',
  delivery_target_session_id TEXT,
  prompt TEXT,
  runtime TEXT,
  model TEXT,
  job_mode TEXT,
  approval_profile TEXT,
  concurrency_policy TEXT NOT NULL DEFAULT 'skip',
  domain_policy_json TEXT NOT NULL DEFAULT '{}',
  rate_limit_policy_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  last_status TEXT,
  last_error TEXT,
  last_result_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(requesting_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  FOREIGN KEY(delivery_target_session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_jobs_enabled_next_run
  ON schedule_jobs(enabled, next_run_at ASC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_jobs_category
  ON schedule_jobs(category, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_jobs_target_agent
  ON schedule_jobs(target_agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS schedule_run_history (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  run_id TEXT,
  session_id TEXT,
  requested_by TEXT,
  delivery_target TEXT NOT NULL,
  summary TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(schedule_id) REFERENCES schedule_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_run_history_schedule_created
  ON schedule_run_history(schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_run_history_status_created
  ON schedule_run_history(status, created_at DESC);
`
  },
  {
    id: '022_continuity_ledger',
    sql: `
CREATE TABLE IF NOT EXISTS continuity_ledger (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT,
  mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  summary TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_continuity_ledger_session_created
  ON continuity_ledger(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_continuity_ledger_mode_created
  ON continuity_ledger(mode, created_at DESC);
`
  },
  {
    id: '023_browser_session_vault',
    sql: `
CREATE TABLE IF NOT EXISTS browser_cookie_jars (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  source_kind TEXT NOT NULL,
  cookies_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_cookie_jars_updated
  ON browser_cookie_jars(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_header_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  headers_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_header_profiles_updated
  ON browser_header_profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_proxy_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  proxy_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_proxy_profiles_updated
  ON browser_proxy_profiles(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_storage_states (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  storage_state_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_storage_states_updated
  ON browser_storage_states(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_session_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  cookie_jar_id TEXT,
  headers_profile_id TEXT,
  proxy_profile_id TEXT,
  storage_state_id TEXT,
  locale TEXT,
  country_code TEXT,
  timezone_id TEXT,
  notes TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(cookie_jar_id) REFERENCES browser_cookie_jars(id) ON DELETE SET NULL,
  FOREIGN KEY(headers_profile_id) REFERENCES browser_header_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY(proxy_profile_id) REFERENCES browser_proxy_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY(storage_state_id) REFERENCES browser_storage_states(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_session_profiles_updated
  ON browser_session_profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_session_profiles_enabled
  ON browser_session_profiles(enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_fetch_cache (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  tool TEXT NOT NULL,
  extraction_mode TEXT NOT NULL,
  main_content_only INTEGER NOT NULL DEFAULT 1,
  artifact_path TEXT NOT NULL,
  preview_text TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_fetch_cache_expires
  ON browser_fetch_cache(expires_at ASC, updated_at DESC);
`
  },
  {
    id: '024_browser_session_profile_connect_metadata',
    sql: `
ALTER TABLE browser_session_profiles ADD COLUMN use_real_chrome INTEGER NOT NULL DEFAULT 0;
ALTER TABLE browser_session_profiles ADD COLUMN owner_label TEXT;
ALTER TABLE browser_session_profiles ADD COLUMN site_key TEXT;
ALTER TABLE browser_session_profiles ADD COLUMN last_verified_at TEXT;
ALTER TABLE browser_session_profiles ADD COLUMN last_verification_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE browser_session_profiles ADD COLUMN last_verification_summary TEXT;
`
  },
  {
    id: '025_browser_session_profile_visibility_and_source',
    sql: `
ALTER TABLE browser_session_profiles ADD COLUMN visibility TEXT NOT NULL DEFAULT 'shared';
ALTER TABLE browser_session_profiles ADD COLUMN allowed_session_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE browser_session_profiles ADD COLUMN browser_kind TEXT;
ALTER TABLE browser_session_profiles ADD COLUMN browser_profile_name TEXT;
ALTER TABLE browser_session_profiles ADD COLUMN browser_profile_path TEXT;
`
  }
];
