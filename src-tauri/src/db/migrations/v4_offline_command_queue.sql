CREATE TABLE IF NOT EXISTS offline_commands (
    command_id TEXT PRIMARY KEY NOT NULL,
    command_type TEXT NOT NULL CHECK (length(trim(command_type)) > 0),
    contract_version INTEGER NOT NULL CHECK (contract_version > 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'conflict')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    CHECK (
        (status = 'synced' AND synced_at IS NOT NULL)
        OR (status <> 'synced' AND synced_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS offline_commands_status_created_at_idx
    ON offline_commands (status, created_at, command_id);

CREATE INDEX IF NOT EXISTS offline_commands_created_at_idx
    ON offline_commands (created_at, command_id);

CREATE INDEX IF NOT EXISTS offline_commands_synced_cleanup_idx
    ON offline_commands (status, synced_at, command_id);

-- The backend command envelope is an append-only fact. State and diagnostics
-- may change, but its identity, kind, version and canonical payload may not.
CREATE TRIGGER IF NOT EXISTS offline_commands_immutable_contract
BEFORE UPDATE OF command_id, command_type, contract_version, payload_json
ON offline_commands
WHEN NEW.command_id IS NOT OLD.command_id
  OR NEW.command_type IS NOT OLD.command_type
  OR NEW.contract_version IS NOT OLD.contract_version
  OR NEW.payload_json IS NOT OLD.payload_json
BEGIN
    SELECT RAISE(ABORT, 'offline command contract fields are immutable');
END;

CREATE TRIGGER IF NOT EXISTS offline_commands_valid_status_transition
BEFORE UPDATE OF status ON offline_commands
WHEN NEW.status <> OLD.status
  AND NOT (
      (OLD.status = 'pending' AND NEW.status = 'syncing')
      OR (OLD.status = 'syncing' AND NEW.status IN ('synced', 'failed', 'conflict'))
      OR (OLD.status = 'failed' AND NEW.status = 'pending')
  )
BEGIN
    SELECT RAISE(ABORT, 'invalid offline command status transition');
END;
