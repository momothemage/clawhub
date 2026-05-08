import { describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
  authTables: {},
}));

import { insertVersion } from "./skills";

type WrappedHandler<TArgs> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<unknown>;
};

const insertVersionHandler = (insertVersion as unknown as WrappedHandler<Record<string, unknown>>)
  ._handler;

const SENTINEL_BAIL_MESSAGE = "__owner_migration_sentinel_stop__";

function buildPublishArgs(overrides?: Partial<Record<string, unknown>>) {
  return {
    userId: "users:caller",
    ownerPublisherId: "publishers:org",
    slug: "nano",
    displayName: "Nano",
    version: "1.0.0",
    changelog: "Initial release",
    changelogSource: "user",
    tags: ["latest"],
    fingerprint: "f".repeat(64),
    files: [
      {
        path: "SKILL.md",
        size: 128,
        storageId: "_storage:1",
        sha256: "a".repeat(64),
        contentType: "text/markdown",
      },
    ],
    parsed: {
      frontmatter: { description: "test" },
      metadata: {},
      clawdis: {},
    },
    embedding: [0.1, 0.2],
    ...overrides,
  };
}

type PublisherMemberRecord = {
  _id: string;
  publisherId: string;
  userId: string;
  role: "owner" | "admin" | "publisher";
};

type OrgMigrationFixture = {
  db: {
    get: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    normalizeId: ReturnType<typeof vi.fn>;
  };
  patchCalls: Array<{ id: string; value: Record<string, unknown> }>;
  insertCalls: Array<{ table: string; value: Record<string, unknown> }>;
};

type SkillSourceMode = "other-personal" | "caller-personal";

function createMigrationFixture(params: {
  sourceMemberships: PublisherMemberRecord[];
  /**
   * Which publisher owns the existing `skills:1` row in this fixture:
   *  - "other-personal": `publishers:personalSource` (linkedUser = users:sourceOwner),
   *    used to simulate an attacker publishing into someone else's slug.
   *  - "caller-personal": `publishers:personalCaller` (linkedUser = users:caller),
   *    used to simulate the real issue scenario: moving your own personal skill
   *    into an org you belong to.
   */
  skillSource?: SkillSourceMode;
}): OrgMigrationFixture {
  const now = Date.now();
  const patchCalls: Array<{ id: string; value: Record<string, unknown> }> = [];
  const insertCalls: Array<{ table: string; value: Record<string, unknown> }> = [];

  const db = {
    get: vi.fn(async (id: string) => {
      if (id === "users:caller") {
        return {
          _id: "users:caller",
          handle: "caller",
          name: "caller",
          deletedAt: undefined,
          deactivatedAt: undefined,
          personalPublisherId: "publishers:personalCaller",
          _creationTime: now,
        };
      }
      if (id === "publishers:personalCaller") {
        return {
          _id: "publishers:personalCaller",
          kind: "user",
          handle: "caller",
          displayName: "caller",
          linkedUserId: "users:caller",
          deletedAt: undefined,
          deactivatedAt: undefined,
        };
      }
      if (id === "publishers:org") {
        return {
          _id: "publishers:org",
          kind: "org",
          handle: "casualsecurityinc",
          displayName: "Casual Security",
          deletedAt: undefined,
          deactivatedAt: undefined,
        };
      }
      if (id === "users:sourceOwner") {
        return {
          _id: "users:sourceOwner",
          handle: "cbrunnkvist",
          deletedAt: undefined,
          deactivatedAt: undefined,
        };
      }
      if (id === "publishers:personalSource") {
        return {
          _id: "publishers:personalSource",
          kind: "user",
          handle: "cbrunnkvist",
          displayName: "cbrunnkvist",
          linkedUserId: "users:sourceOwner",
          deletedAt: undefined,
          deactivatedAt: undefined,
        };
      }
      return null;
    }),
    query: vi.fn((table: string) => {
      if (table === "publishers") {
        return {
          withIndex: (_name: string, build: (q: unknown) => unknown) => {
            // Handle any publisher-handle lookup by returning the caller/source/org
            // as inert (not present) to keep ensurePersonalPublisherForUser happy.
            const q: Record<string, unknown> = {
              eq: (_field: string, _value: unknown) => q,
            };
            build?.(q);
            return { unique: async () => null };
          },
        };
      }
      if (table === "publisherMembers") {
        return {
          withIndex: (
            name: string,
            build: (q: { eq: (field: string, value: string) => unknown }) => unknown,
          ) => {
            if (name !== "by_publisher_user") {
              throw new Error(`unexpected publisherMembers index ${name}`);
            }
            let publisherId = "";
            let userId = "";
            const q = {
              eq: (field: string, value: string) => {
                if (field === "publisherId") publisherId = value;
                if (field === "userId") userId = value;
                return q;
              },
            };
            build(q);
            return {
              unique: async () => {
                // Synthesize an "owner" membership for every personal publisher
                // so ensurePersonalPublisherForUser's internal patch/insert path
                // doesn't trip on missing members.
                if (publisherId === "publishers:personalCaller" && userId === "users:caller") {
                  return {
                    _id: "publisherMembers:personalCaller",
                    publisherId,
                    userId,
                    role: "owner",
                  };
                }
                // Caller always has publisher-role on the target org in these
                // tests; that's the precondition `requirePublisherRole` checks
                // above our new migration branch. Source-publisher membership
                // is parameterized per-test via `sourceMemberships`.
                if (publisherId === "publishers:org" && userId === "users:caller") {
                  return {
                    _id: "publisherMembers:orgCaller",
                    publisherId,
                    userId,
                    role: "publisher",
                  };
                }
                const match = params.sourceMemberships.find(
                  (m) => m.publisherId === publisherId && m.userId === userId,
                );
                return match ?? null;
              },
            };
          },
        };
      }
      if (table === "skills") {
        return {
          withIndex: (
            name: string,
            build: ((q: { eq: (field: string, value: string) => unknown }) => unknown) | undefined,
          ) => {
            if (name === "by_slug") {
              const q = {
                eq: (_field: string, _value: string) => q,
              };
              build?.(q);
              const mode: SkillSourceMode = params.skillSource ?? "other-personal";
              return {
                unique: async () => ({
                  _id: "skills:1",
                  slug: "nano",
                  ownerUserId: mode === "caller-personal" ? "users:caller" : "users:sourceOwner",
                  ownerPublisherId:
                    mode === "caller-personal"
                      ? "publishers:personalCaller"
                      : "publishers:personalSource",
                  softDeletedAt: undefined,
                  moderationStatus: "active",
                  moderationFlags: undefined,
                }),
              };
            }
            // Any subsequent skill-table access means migration was allowed and
            // insertVersion proceeded to the "brand new skill" path. Bail out
            // with a sentinel so the test can assert patch/insert calls without
            // having to mock the entire downstream pipeline.
            throw new Error(SENTINEL_BAIL_MESSAGE);
          },
        };
      }
      if (table === "skillSlugAliases") {
        return {
          withIndex: (name: string) => {
            if (name === "by_skill") {
              return { collect: async () => [] };
            }
            if (name === "by_slug") {
              return { unique: async () => null };
            }
            throw new Error(`unexpected skillSlugAliases index ${name}`);
          },
        };
      }
      if (table === "authAccounts") {
        return {
          withIndex: () => ({
            unique: async () => null,
          }),
        };
      }
      // Any access to a downstream table means the migration branch completed
      // and insertVersion proceeded into the publish pipeline. Bail out with a
      // sentinel so the test can assert patch/insert side-effects without
      // having to mock the entire pipeline.
      throw new Error(SENTINEL_BAIL_MESSAGE);
    }),
    patch: vi.fn(async (id: string, value: Record<string, unknown>) => {
      patchCalls.push({ id, value });
    }),
    insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
      insertCalls.push({ table, value });
      return `${table}:inserted`;
    }),
    normalizeId: vi.fn(),
  };

  return { db, patchCalls, insertCalls };
}

describe("skills.insertVersion owner migration", () => {
  it("rejects slug migration when caller has no publisher role on the source publisher", async () => {
    const fixture = createMigrationFixture({ sourceMemberships: [] });

    await expect(
      insertVersionHandler({ db: fixture.db } as never, buildPublishArgs() as never),
    ).rejects.toThrow(/Slug is already taken/);

    // The skill row must NOT be patched when the caller is not a source member.
    const skillPatches = fixture.patchCalls.filter((p) => p.id === "skills:1");
    expect(skillPatches).toHaveLength(0);

    // No migration audit log should be written on the rejection path.
    const migrationAudits = fixture.insertCalls.filter(
      (call) => call.table === "auditLogs" && call.value.action === "skill.ownership.migrate",
    );
    expect(migrationAudits).toHaveLength(0);
  });

  it("migrates ownership when caller moves their OWN personal skill into an org they belong to", async () => {
    // Real issue scenario: @cbrunnkvist owns `nano` under their personal
    // publisher and wants to republish under `@casualsecurityinc`.
    const fixture = createMigrationFixture({
      skillSource: "caller-personal",
      // No extra memberships needed — ensurePersonalPublisherForUser already
      // grants the caller an "owner" membership on publishers:personalCaller.
      sourceMemberships: [],
    });

    // After the migration branch succeeds we bail out via a sentinel so we can
    // assert on the side-effects without fully mocking downstream pipeline.
    await expect(
      insertVersionHandler({ db: fixture.db } as never, buildPublishArgs() as never),
    ).rejects.toThrow(SENTINEL_BAIL_MESSAGE);

    const skillPatches = fixture.patchCalls.filter((p) => p.id === "skills:1");
    expect(skillPatches).toHaveLength(1);
    expect(skillPatches[0]?.value).toMatchObject({
      ownerPublisherId: "publishers:org",
      ownerUserId: "users:caller",
    });

    const migrationAudits = fixture.insertCalls.filter(
      (call) => call.table === "auditLogs" && call.value.action === "skill.ownership.migrate",
    );
    expect(migrationAudits).toHaveLength(1);
    const auditMetadata = migrationAudits[0]?.value.metadata as {
      from?: { ownerPublisherId?: string; ownerUserId?: string };
      to?: { ownerPublisherId?: string; ownerUserId?: string };
    };
    expect(auditMetadata.from).toEqual({
      ownerPublisherId: "publishers:personalCaller",
      ownerUserId: "users:caller",
    });
    expect(auditMetadata.to).toEqual({
      ownerPublisherId: "publishers:org",
      ownerUserId: "users:caller",
    });
  });

  it("refuses to migrate a skill out of SOMEONE ELSE'S personal publisher even if caller happens to be a member", async () => {
    // Defense-in-depth: addMember currently doesn't forbid adding extra
    // members to a user-kind publisher. We must still refuse to let the
    // extra member move that user's skills away from them.
    const fixture = createMigrationFixture({
      skillSource: "other-personal",
      sourceMemberships: [
        {
          _id: "publisherMembers:sourceCaller",
          publisherId: "publishers:personalSource",
          userId: "users:caller",
          role: "publisher",
        },
      ],
    });

    await expect(
      insertVersionHandler({ db: fixture.db } as never, buildPublishArgs() as never),
    ).rejects.toThrow(/Slug is already taken/);

    const skillPatches = fixture.patchCalls.filter((p) => p.id === "skills:1");
    expect(skillPatches).toHaveLength(0);
    const migrationAudits = fixture.insertCalls.filter(
      (call) => call.table === "auditLogs" && call.value.action === "skill.ownership.migrate",
    );
    expect(migrationAudits).toHaveLength(0);
  });

  it("does NOT migrate ownership when caller omits ownerPublisherId (prevents silent re-ownership)", async () => {
    const fixture = createMigrationFixture({
      sourceMemberships: [
        // Caller happens to be a publisher on the source org — but has NOT
        // explicitly asked for any particular target publisher. Without the
        // explicit opt-in, we must fall through to the "Slug is already taken"
        // error instead of silently migrating the org-owned skill back into
        // the caller's personal namespace.
        {
          _id: "publisherMembers:sourceCaller",
          publisherId: "publishers:personalSource",
          userId: "users:caller",
          role: "publisher",
        },
      ],
    });

    const argsWithoutOwner = buildPublishArgs();
    delete (argsWithoutOwner as Record<string, unknown>).ownerPublisherId;

    await expect(
      insertVersionHandler({ db: fixture.db } as never, argsWithoutOwner as never),
    ).rejects.toThrow(/Slug is already taken/);

    const skillPatches = fixture.patchCalls.filter((p) => p.id === "skills:1");
    expect(skillPatches).toHaveLength(0);

    const migrationAudits = fixture.insertCalls.filter(
      (call) => call.table === "auditLogs" && call.value.action === "skill.ownership.migrate",
    );
    expect(migrationAudits).toHaveLength(0);
  });
});
