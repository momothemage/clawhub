import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { SkillCard } from "../components/SkillCard";
import { SkillListItem } from "../components/SkillListItem";
import { SkillStatsTripletLine } from "../components/SkillStats";
import { SoulCard } from "../components/SoulCard";
import { SoulStatsTripletLine } from "../components/SoulStats";
import { UserBadge } from "../components/UserBadge";
import { convexHttp } from "../convex/client";
import { getSkillBadges } from "../lib/badges";
import { formatCompactStat } from "../lib/numberFormat";
import type { PublicPublisher, PublicSkill, PublicSoul } from "../lib/publicUser";
import { getSiteMode } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const mode = getSiteMode();
  return mode === "souls" ? <OnlyCrabsHome /> : <SkillsHome />;
}

function SkillsHome() {
  type SkillPageEntry = {
    skill: PublicSkill;
    ownerHandle?: string | null;
    owner?: PublicPublisher | null;
    latestVersion?: unknown;
  };

  const [highlighted, setHighlighted] = useState<SkillPageEntry[]>([]);
  const [trending, setTrending] = useState<SkillPageEntry[]>([]);
  const [recent, setRecent] = useState<SkillPageEntry[]>([]);
  const [skillCount, setSkillCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      convexHttp.query(api.skills.listHighlightedPublic, { limit: 6 }),
      convexHttp.query(api.skills.listPublicPageV4, {
        numItems: 8,
        sort: "downloads",
        dir: "desc",
        nonSuspiciousOnly: true,
      }),
      convexHttp.query(api.skills.listPublicPageV4, {
        numItems: 8,
        sort: "updated",
        dir: "desc",
        nonSuspiciousOnly: true,
      }),
      convexHttp.query(api.skills.countPublicSkills, {}),
    ])
      .then(([h, t, r, c]) => {
        if (cancelled) return;
        setHighlighted(h as SkillPageEntry[]);
        setTrending((t as { page: SkillPageEntry[] }).page);
        setRecent((r as { page: SkillPageEntry[] }).page);
        setSkillCount(c as number);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      {/* Value prop hero — no search (navbar handles it) */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1 className="home-hero-title">
            The collaborative hub for agent skills
          </h1>
          <p className="home-hero-subtitle">
            Discover, install, and share skill bundles for AI agents.
            {skillCount != null ? ` ${formatCompactStat(skillCount)} skills and growing.` : ""}
          </p>
          <div className="home-hero-actions">
            <Link
              to="/skills"
              search={{
                q: undefined,
                sort: undefined,
                dir: undefined,
                highlighted: undefined,
                nonSuspicious: true,
                view: undefined,
                focus: undefined,
              }}
              className="btn btn-primary"
            >
              Browse skills
            </Link>
            <Link
              to="/publish-skill"
              search={{ updateSlug: undefined }}
              className="btn"
            >
              Publish yours
            </Link>
          </div>
          <p className="home-hero-explainer">
            Skills are portable bundles of instructions, prompts, and tools
            that give AI agents new capabilities. Install with one command.
          </p>
        </div>
      </section>

      {/* Trending this week */}
      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Trending</h2>
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: "downloads" as const,
              dir: "desc" as const,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="home-section-link"
          >
            See all
          </Link>
        </div>
        <div className="results-list">
          {trending.length === 0 ? (
            <SkeletonRows count={4} />
          ) : (
            trending.map((entry) => (
              <SkillListItem
                key={entry.skill._id}
                skill={entry.skill}
                ownerHandle={entry.ownerHandle}
                owner={entry.owner}
              />
            ))
          )}
        </div>
      </section>

      {/* Recently updated */}
      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Recently updated</h2>
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: "updated" as const,
              dir: "desc" as const,
              highlighted: undefined,
              nonSuspicious: true,
              view: undefined,
              focus: undefined,
            }}
            className="home-section-link"
          >
            See all
          </Link>
        </div>
        <div className="results-list">
          {recent.length === 0 ? (
            <SkeletonRows count={4} />
          ) : (
            recent.map((entry) => (
              <SkillListItem
                key={entry.skill._id}
                skill={entry.skill}
                ownerHandle={entry.ownerHandle}
                owner={entry.owner}
              />
            ))
          )}
        </div>
      </section>

      {/* Staff picks */}
      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Staff picks</h2>
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              highlighted: true,
              nonSuspicious: undefined,
              view: undefined,
              focus: undefined,
            }}
            className="home-section-link"
          >
            See all
          </Link>
        </div>
        <div className="grid">
          {highlighted.length === 0 ? (
            <div className="card">No highlighted skills yet.</div>
          ) : (
            highlighted.map((entry) => (
              <SkillCard
                key={entry.skill._id}
                skill={entry.skill}
                badge={getSkillBadges(entry.skill)}
                summaryFallback="A fresh skill bundle."
                meta={
                  <div className="skill-card-footer-rows">
                    <UserBadge
                      user={entry.owner}
                      fallbackHandle={entry.ownerHandle ?? null}
                      prefix="by"
                      link={false}
                    />
                    <div className="stat">
                      <SkillStatsTripletLine stats={entry.skill.stats} />
                    </div>
                  </div>
                }
              />
            ))
          )}
        </div>
      </section>

      {/* Quick links */}
      <section className="home-section">
        <div className="home-quick-links">
          <Link
            to="/skills"
            search={{ q: undefined, sort: "stars" as const, dir: "desc" as const, highlighted: undefined, nonSuspicious: true, view: undefined, focus: undefined }}
            className="home-quick-link"
          >
            Most starred
          </Link>
          <Link
            to="/skills"
            search={{ q: undefined, sort: "newest" as const, dir: undefined, highlighted: undefined, nonSuspicious: true, view: undefined, focus: undefined }}
            className="home-quick-link"
          >
            New this week
          </Link>
          <Link to="/plugins" className="home-quick-link">
            Browse plugins
          </Link>
          <Link
            to="/skills"
            search={{ q: undefined, sort: undefined, dir: undefined, highlighted: true, nonSuspicious: undefined, view: undefined, focus: undefined }}
            className="home-quick-link"
          >
            Staff picks
          </Link>
        </div>
      </section>
    </main>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-bar skeleton-bar-lg" />
          <div className="skeleton-bar skeleton-bar-sm" />
          <div className="skeleton-bar skeleton-bar-xs" />
        </div>
      ))}
    </>
  );
}

function OnlyCrabsHome() {
  const navigate = Route.useNavigate();
  const ensureSoulSeeds = useAction(api.seed.ensureSoulSeeds);
  const latest = (useQuery(api.souls.list, { limit: 12 }) as PublicSoul[]) ?? [];
  const [query, setQuery] = useState("");
  const seedEnsuredRef = useRef(false);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (seedEnsuredRef.current) return;
    seedEnsuredRef.current = true;
    void ensureSoulSeeds({});
  }, [ensureSoulSeeds]);

  return (
    <main>
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1 className="home-hero-title">SoulHub, where system lore lives.</h1>
          <p className="home-hero-subtitle">
            Share SOUL.md bundles, version them like docs, and keep personal system lore in one
            public place.
          </p>
          <form
            className="home-hero-search"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate({
                to: "/souls",
                search: {
                  q: trimmedQuery || undefined,
                  sort: undefined,
                  dir: undefined,
                  view: undefined,
                  focus: undefined,
                },
              });
            }}
          >
            <input
              className="home-hero-search-input"
              type="text"
              placeholder="Search souls, prompts, or lore"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <h2 className="home-section-title">Latest souls</h2>
          <Link
            to="/souls"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              view: undefined,
              focus: undefined,
            }}
            className="home-section-link"
          >
            See all
          </Link>
        </div>
        <div className="grid">
          {latest.length === 0 ? (
            <div className="card">No souls yet. Be the first.</div>
          ) : (
            latest.map((soul) => (
              <SoulCard
                key={soul._id}
                soul={soul}
                summaryFallback="A SOUL.md bundle."
                meta={
                  <div className="stat">
                    <SoulStatsTripletLine stats={soul.stats} />
                  </div>
                }
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
