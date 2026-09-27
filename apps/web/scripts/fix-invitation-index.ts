/**
 * One-off migration: replace the organization invitation unique index.
 *
 * The schema now declares a **partial** unique index that applies only to
 * pending invitations:
 *
 *   { organizationId: 1, email: 1 }
 *     unique, partialFilterExpression: { status: "pending" }
 *
 * It replaces the previous index, which included `status` in the key:
 *
 *   { organizationId: 1, email: 1, status: 1 }  unique
 *
 * The old key cannot be left in place. Because accepted and declined invitations
 * are now **kept as history** rather than deleted, a status-suffixed unique index
 * would reject the second acceptance of the same person to the same
 * organization — inviting and accepting someone again after they left would fail
 * at accept time with an opaque duplicate-key error.
 *
 * Mongo will not drop or replace this by itself: an index is identified by its
 * key pattern, so a schema change alone leaves the old index active and Mongoose
 * will try to create the new one alongside it. This script drops the old index
 * when it exists and is safe to re-run.
 *
 * Mongoose creates the new index automatically on the next model use, so this
 * script only needs to remove the obstacle. Pass --dry-run to report what would
 * change without writing.
 *
 *   npx tsx scripts/fix-invitation-index.ts --dry-run
 *   npx tsx scripts/fix-invitation-index.ts
 */
import { connectProjectDB } from "@/db/db";
import { organizationInvitationModel } from "@/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

/** The index being replaced, as Mongo names it by default. */
const LEGACY_INDEX = "organizationId_1_email_1_status_1";

async function main() {
  await connectProjectDB();

  const collection = organizationInvitationModel.collection;
  const existing = await collection.indexes();
  const names = existing.map((index) => index.name);

  console.log(`Invitations: ${await organizationInvitationModel.estimatedDocumentCount()} document(s)`);
  console.log("Indexes before:");
  for (const index of existing) {
    console.log(`  ${index.name}  ${JSON.stringify(index.key)}`);
  }

  if (!names.includes(LEGACY_INDEX)) {
    console.log(`\nNo legacy index "${LEGACY_INDEX}" — nothing to do.`);
    return;
  }

  // Report duplicates that the *new* index would reject, so a failure here is
  // diagnosed before it happens at accept time rather than surfacing as a
  // confusing error during an invite.
  const duplicates = await collection
    .aggregate([
      { $match: { status: "pending" } },
      {
        $group: {
          _id: { organizationId: "$organizationId", email: "$email" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicates.length > 0) {
    console.error(
      `\nRefusing to continue: ${duplicates.length} email(s) have more than one pending invitation.`,
    );
    for (const duplicate of duplicates) {
      console.error(`  ${duplicate._id.email} in ${duplicate._id.organizationId} x${duplicate.count}`);
    }
    console.error(
      "\nRevoke the surplus invitations from organization settings, then re-run.",
    );
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] would drop "${LEGACY_INDEX}"`);
    return;
  }

  await collection.dropIndex(LEGACY_INDEX);
  console.log(`\nDropped "${LEGACY_INDEX}".`);
  console.log(
    "The replacement is created by Mongoose on next use; run `syncIndexes` only if it does not appear.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
