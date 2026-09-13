"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, RefreshCw } from "lucide-react";
import { BACKEND } from "@/lib/sessions/store";
import type { LibraryPost } from "@/lib/sessions/types";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function LibraryPage() {
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND}/api/library`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { posts: LibraryPost[] };
      setPosts(data.posts);
    } catch (err) {
      setError(String(err));
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);

  const counts = useMemo(
    () => ({
      total: posts.length,
      profile: posts.filter((post) => post.kind === "profile_post").length,
    }),
    [posts],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-6 pt-5">
        <PageHeader
          title="Library"
          description="Stored Reddit post links from completed agent work"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          }
        />
      </div>

      <div className="space-y-4 px-6 pb-8 pt-5">
        <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
          <Metric label="Posts" value={counts.total} />
          <Metric label="Profile posts" value={counts.profile} />
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          {loading ? (
            <EmptyState icon={BookOpen} title="Loading library" />
          ) : error ? (
            <EmptyState
              icon={BookOpen}
              title="Library unavailable"
              description="Start the backend to load stored post links."
            />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No posts stored yet"
              description="Completed agent posts will appear here with their Reddit links."
            />
          ) : (
            <div className="divide-y divide-border">
              {posts.map((post) => (
                <article
                  key={`${post.persona}-${post.id}-${post.url}`}
                  className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[160px_1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {post.persona}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {post.kind === "profile_post" ? "Profile post" : "Post"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {post.title ?? "Untitled post"}
                    </p>
                    {post.content && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {post.content}
                      </p>
                    )}
                    <p className="mt-1 truncate font-mono text-[11px] text-fg-subtle">
                      {post.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 lg:justify-end">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(post.timestamp)}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <a href={post.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" />
                        Open
                      </a>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg text-foreground">{value}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
