import { SyncEngine } from './SyncEngine.js';
import { DatabaseManager } from '@mumbai-timetable/database';
import { LocalStorageProvider } from '@mumbai-timetable/shared';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const engine = new SyncEngine();

  console.log(`\n======================================================`);
  console.log(`  MUMBAI LOCAL TIMETABLE - SYNC ENGINE CLI`);
  console.log(`======================================================\n`);

  switch (command) {
    case 'check': {
      console.log('Checking official railway timetable sources...');
      const status = await engine.executeSync(false);
      console.log(`Sync Check Result: ${status.status}`);
      if (status.version) console.log(`Active Version: ${status.version}`);
      break;
    }

    case 'sync': {
      console.log('Triggering full synchronization pipeline...');
      const result = await engine.executeSync(true);
      console.log(`Sync Result: ${result.status}`);
      if (result.version) console.log(`Published Version: ${result.version}`);
      if (result.error) console.error(`Error: ${result.error}`);
      break;
    }

    case 'simulate': {
      console.log('Simulating Section 35 scenario (Kalyan 07:20 -> 07:23)...');
      const sim = await engine.simulateTimetableChangeScenario();
      if (sim.success) {
        console.log(`Initial Version: ${sim.initialVersion}`);
        console.log(`Modified Version: ${sim.modifiedVersion}`);
        console.log(`Diff Summary:`, sim.diffSummary);
        console.log(`Incremental Patch Size: ${sim.patchSizeBytes} bytes (vs ~50MB full DB)`);
        console.log(`Data savings: ~99.9% mobile bandwidth saved!`);
      } else {
        console.error(`Simulation failed: ${sim.error}`);
      }
      break;
    }

    case 'rollback-test': {
      console.log('Running Section 36 Rollback Test with corrupt update payload...');
      const db = new DatabaseManager();
      await db.initializeDatabase();

      // First sync and import
      await engine.executeSync(true);
      const storage = new LocalStorageProvider({ basePath: './storage/google-drive-mock' });
      const dataset = await storage.getDataset('current');
      if (!dataset) {
        console.error('No dataset available for rollback test');
        return;
      }

      await db.importFullDataset(dataset);
      const versionBefore = await db.getActiveVersion();
      console.log(`Database initialized with active version: ${versionBefore}`);

      // Generate corrupt payload
      const corruptPkg = engine.generateCorruptUpdatePackage(versionBefore!, '2026.99.99.999');
      console.log('Attempting to apply corrupted update package...');
      const result = await db.applyUpdatePackage(corruptPkg);

      console.log(`Update result success: ${result.success}`);
      console.log(`Rollback applied: ${result.rollbackApplied}`);
      console.log(`Error caught: ${result.error}`);

      const versionAfter = await db.getActiveVersion();
      console.log(`Active version after rollback: ${versionAfter}`);
      if (versionAfter === versionBefore) {
        console.log('\n[PASS] Database integrity preserved! Rollback verified successfully.');
      } else {
        console.error('\n[FAIL] Version changed despite corrupt update!');
      }
      break;
    }

    case 'status': {
      const status = engine.getStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    default:
      console.log(`Usage: cli [check | sync | simulate | rollback-test | status]`);
  }
}

main().catch(console.error);
