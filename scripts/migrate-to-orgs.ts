/**
 * One-off migration: move projects from `ownerId` to `organizationId`.
 *
 * For each distinct project owner we create (or reuse) a personal organization
 * named after them, make them its admin, and repoint their projects at it.
 *
 *   npx tsx scripts/migrate-to-orgs.ts --dry-run
 *   npx tsx scripts/migrate-to-orgs.ts
 */
import { Types } from "mongoose";
import { connectProjectDB } from "@/db/db";
import {
  organizationMemberModel,
  organizationModel,
  projectActivityModel,
  projectModel,
} from "@/db/schema";
import { getAuthDb } from "@/lib/mongo";
import { slugify } from "@/lib/slug";

const DRY_RUN = process.argv.includes("--dry-run");

async function userProfile(userId: string) {
  const users = getAuthDb().collection("user");

  // better-auth stores a string `id` field, but older rows may only have _id.
  const byStringId = await users.findOne({ id: userId });

  if (byStringId) {
    return {
      name: (byStringId.name as string) ?? "Personal",
      email: (byStringId.email as string) ?? "",
    };
  }

  if (Types.ObjectId.isValid(userId)) {
    const byObjectId = await users.findOne({ _id: new Types.ObjectId(userId) });

    if (byObjectId) {
      return {
        name: (byObjectId.name as string) ?? "Personal",
        email: (byObjectId.email as string) ?? "",
      };
    }
  }

  return { name: "Personal", email: "" };
}

async function main() {
  // Next.js loads .env for us, but this script runs under plain tsx.
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present; rely on the ambient environment.
  }

  await connectProjectDB();

  const legacy = await projectModel
    .find({ $or: [{ organizationId: { $exists: false } }, { organizationId: null }] })
    .select("_id ownerId projectName")
    .lean();

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}found ${legacy.length} project(s) without an organization`,
  );

  if (legacy.length === 0) {
    console.log("nothing to do");
    return;
  }

  const ownerIds = [
    ...new Set(
      legacy
        .map((p) => (p as unknown as { ownerId?: string }).ownerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const unowned = legacy.filter(
    (p) => !(p as unknown as { ownerId?: string }).ownerId,
  );

  if (unowned.length > 0) {
    console.warn(
      `  ! ${unowned.length} project(s) have no ownerId and cannot be attributed:`,
    );
    for (const project of unowned) {
      console.warn(`      ${project.projectName} (${String(project._id)})`);
    }
  }

  for (const ownerId of ownerIds) {
    const profile = await userProfile(ownerId);

    const existingSlug = slugify(profile.name) || `org-${ownerId.slice(0, 8)}`;
    let org = await organizationModel.findOne({ slug: existingSlug }).lean();

    if (!org) {
      const doc = {
        name: `${profile.name}'s Organization`,
        slug: existingSlug,
        createdBy: ownerId,
      };

      if (DRY_RUN) {
        console.log(`  would create org "${doc.name}" (${doc.slug})`);
        continue;
      }

      org = (await organizationModel.create(doc)).toObject();
      await organizationMemberModel.create({
        organizationId: org._id,
        userId: ownerId,
        email: profile.email,
        name: profile.name,
        role: "admin",
      });
      console.log(`  created org "${org.name}" (${org.slug})`);
    } else {
      console.log(`  reusing org "${org.name}" (${org.slug})`);
      if (DRY_RUN) {
        continue;
      }
      await organizationMemberModel.updateOne(
        { organizationId: org._id, userId: ownerId },
        {
          $setOnInsert: {
            email: profile.email,
            name: profile.name,
            role: "admin",
          },
        },
        { upsert: true },
      );
    }

    const owned = legacy.filter(
      (p) => (p as unknown as { ownerId?: string }).ownerId === ownerId,
    );

    const ownedProjectIds = owned.map((p) => p._id);

    if (DRY_RUN) {
      console.log(`  would move ${owned.length} project(s) into ${org.slug}`);
      const activityCount = await projectActivityModel.countDocuments({
        projectId: { $in: ownedProjectIds },
        $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
      });
      if (activityCount > 0) {
        console.log(`    and backfill ${activityCount} activity record(s)`);
      }
      continue;
    }

    const result = await projectModel.updateMany(
      { _id: { $in: ownedProjectIds } },
      { $set: { organizationId: org._id }, $unset: { ownerId: "" } },
    );

    // Activity rows are also scoped by organization now, so backfill the
    // existing ones for the projects we just moved.
    const activityResult = await projectActivityModel.updateMany(
      {
        projectId: { $in: ownedProjectIds },
        $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
      },
      { $set: { organizationId: org._id } },
    );

    console.log(`  moved ${result.modifiedCount} project(s) into ${org.slug}`);
    if (activityResult.modifiedCount > 0) {
      console.log(
        `  backfilled ${activityResult.modifiedCount} activity record(s)`,
      );
    }
  }

  console.log(DRY_RUN ? "\ndry run complete, no changes written" : "\nmigration complete");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("migration failed:", error);
    process.exit(1);
  });
