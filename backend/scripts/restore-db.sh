#!/bin/bash

# Load environment variables from .env.local
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Set default values if not provided in environment
DB_HOST=${POSTGRES_HOST:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DB:-ritt_drive_thru}
DB_USER=${POSTGRES_USER:-postgres}
BACKUP_DIR="./backups"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "Please provide the backup file name (from the backups directory)"
  echo "Available backups:"
  ls -1 "$BACKUP_DIR"/*.gz
  exit 1
fi

BACKUP_FILE="$BACKUP_DIR/$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring database $DB_NAME from backup: $BACKUP_FILE"

# Create temporary uncompressed file
TEMP_FILE="${BACKUP_FILE%.gz}"
gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"

# Drop and recreate database
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "postgres" \
  -c "DROP DATABASE IF EXISTS $DB_NAME;"

PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "postgres" \
  -c "CREATE DATABASE $DB_NAME;"

# Restore from backup
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "$TEMP_FILE"

if [ $? -eq 0 ]; then
  echo "Database restored successfully"
  rm "$TEMP_FILE"
else
  echo "Database restore failed!"
  rm "$TEMP_FILE"
  exit 1
fi 