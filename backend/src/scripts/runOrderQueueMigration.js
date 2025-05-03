// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Script to run the order queue migration
 * This will create the order_queue table in the database
 */

import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Run the migration
console.log('Running order queue migration...');
exec('pnpm run migration:run', { cwd: path.resolve(rootDir, '..') }, (error, stdout, stderr) => {
  if (error) {
    console.error('Error running migration:', error);
    console.error(stderr);
    process.exit(1);
  }
  
  console.log(stdout);
  console.log('Migration completed successfully!');
  
  // Next steps
  console.log('\nNext steps:');
  console.log('1. Start the server with: pnpm run dev');
  console.log('2. The order queue system will automatically start processing orders');
  console.log('3. Monitor queue status at: /api/admin/queue/stats');
  
  process.exit(0);
});
