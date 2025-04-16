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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp for backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"

echo "Creating backup of database $DB_NAME..."

# Create backup using pg_dump
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -F p \
  -b \
  -v \
  -f "$BACKUP_FILE" \
  "$DB_NAME"

if [ $? -eq 0 ]; then
  echo "Backup created successfully: $BACKUP_FILE"
  
  # Compress the backup
  gzip "$BACKUP_FILE"
  echo "Backup compressed: ${BACKUP_FILE}.gz"
  
  # Keep only the last 5 backups
  cd "$BACKUP_DIR"
  ls -t *.gz | tail -n +6 | xargs -r rm
  echo "Cleaned up old backups, keeping the 5 most recent"
else
  echo "Backup failed!"
  exit 1
fi 