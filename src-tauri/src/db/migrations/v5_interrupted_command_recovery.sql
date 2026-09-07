DROP TRIGGER IF EXISTS offline_commands_valid_status_transition;

CREATE TRIGGER offline_commands_valid_status_transition
BEFORE UPDATE OF status ON offline_commands
WHEN NEW.status <> OLD.status
  AND NOT (
      (OLD.status = 'pending' AND NEW.status = 'syncing')
      OR (OLD.status = 'syncing' AND NEW.status IN ('pending', 'synced', 'failed', 'conflict'))
      OR (OLD.status = 'failed' AND NEW.status = 'pending')
  )
BEGIN
    SELECT RAISE(ABORT, 'invalid offline command status transition');
END;
