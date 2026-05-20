import { useEffect, useState } from "react";
import { Activity as ActivityIcon, ArrowLeft, Clock3, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/api";
import ActivityTimeline from "../components/ActivityTimeline";
import Loader from "../components/Loader";

const Activity = () => {
  const [activities, setActivities] = useState([]);
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, hasMore: false });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const categories = [
    { id: "all", label: "All" },
    { id: "meetings", label: "Meetings" },
    { id: "invitations", label: "Invitations" },
    { id: "moderation", label: "Moderation" },
    { id: "rooms", label: "Rooms" },
  ];

  useEffect(() => {
    let isMounted = true;

    const fetchActivity = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get("/activity", {
          params: {
            limit: 20,
            page,
            paginated: true,
            ...(category !== "all" ? { category } : {}),
          },
        });

        if (isMounted) {
          setActivities(data.items || []);
          setMeta({ total: data.total || 0, hasMore: Boolean(data.hasMore) });
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Could not load activity.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchActivity();

    return () => {
      isMounted = false;
    };
  }, [category, page]);

  return (
    <section className="space-y-6">
      <div className="page-hero">
        <Link to="/dashboard" className="btn-secondary mb-6 w-fit">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <p className="section-kicker">Activity</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">
          Workspace activity
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Review the latest room, meeting, user, and moderation events in one clean timeline.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="status-pill">
            <ActivityIcon className="h-3.5 w-3.5 text-mint-500" />
            {activities.length} events
          </span>
          <span className="status-pill">
            <Clock3 className="h-3.5 w-3.5 text-lavender-500" />
            Latest first
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="soft-panel p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit flex-wrap gap-2 rounded-xl border border-white/70 bg-white/65 p-1 shadow-sm backdrop-blur">
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategory(item.id);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  category === item.id ? "bg-navy-900 text-white shadow-soft" : "text-slate-500 hover:bg-white hover:text-navy-900"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>
          <span className="status-pill">{meta.total} total</span>
        </div>
        {isLoading ? (
          <Loader label="Loading activity" className="rounded-xl bg-white/60 px-4 py-5" />
        ) : (
          <>
            <div className="scroll-panel max-h-[34rem]">
              <ActivityTimeline activities={activities} emptyTitle="No activity yet" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
                disabled={page === 1}
                className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="status-pill">Page {page}</span>
              <button
                type="button"
                onClick={() => setPage((currentPage) => currentPage + 1)}
                disabled={!meta.hasMore}
                className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </section>
  );
};

export default Activity;
