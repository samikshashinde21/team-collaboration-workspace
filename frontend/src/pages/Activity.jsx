import { useEffect, useState } from "react";
import { Activity as ActivityIcon, ArrowLeft, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/api";
import ActivityTimeline from "../components/ActivityTimeline";

const Activity = () => {
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchActivity = async () => {
      try {
        const { data } = await api.get("/activity", {
          params: { limit: 100 },
        });

        if (isMounted) {
          setActivities(data);
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
  }, []);

  return (
    <section className="space-y-6">
      <div className="page-hero">
        <Link to="/admin/dashboard" className="btn-secondary mb-6 w-fit">
          <ArrowLeft className="h-4 w-4" />
          Admin dashboard
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
        {isLoading ? (
          <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading activity...</p>
        ) : (
          <ActivityTimeline activities={activities} emptyTitle="No activity yet" />
        )}
      </section>
    </section>
  );
};

export default Activity;
