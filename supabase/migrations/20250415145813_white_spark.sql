/*
  # Add sync schedule tracking

  1. Changes
    - Add last_sync_at column to api_integrations table
    - Add sync_interval_minutes column to api_integrations table
    - Add sync_enabled column to api_integrations table
    - Add indexes for sync scheduling

  2. Notes
    - Helps track and manage periodic sync schedule
    - Allows customizing sync interval per integration
    - Enables/disables automatic sync per integration
*/

-- Add sync scheduling columns to api_integrations
ALTER TABLE api_integrations
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS sync_interval_minutes integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS sync_enabled boolean DEFAULT true;

-- Create index for sync scheduling
CREATE INDEX IF NOT EXISTS idx_api_integrations_sync_schedule 
ON api_integrations(sync_enabled, last_sync_at) 
WHERE sync_enabled = true;

-- Create function to update last_sync_at
CREATE OR REPLACE FUNCTION update_last_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_sync_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_sync_at on token refresh
CREATE TRIGGER update_sync_timestamp
  BEFORE UPDATE OF token ON api_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_last_sync_timestamp();

-- Add logging for sync operations
CREATE OR REPLACE FUNCTION log_sync_operation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO operation_logs (
    operation,
    entity_type,
    entity_id,
    details
  ) VALUES (
    'sync_update',
    'integration',
    NEW.id::text,
    jsonb_build_object(
      'previous_sync', OLD.last_sync_at,
      'new_sync', NEW.last_sync_at,
      'sync_enabled', NEW.sync_enabled,
      'sync_interval', NEW.sync_interval_minutes
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sync operation logging
CREATE TRIGGER log_sync_operations
  AFTER UPDATE OF last_sync_at, sync_enabled, sync_interval_minutes
  ON api_integrations
  FOR EACH ROW
  EXECUTE FUNCTION log_sync_operation();