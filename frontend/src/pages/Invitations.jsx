import { useEffect, useState } from "react";
import { Check, Clock3, ClipboardList, X } from "lucide-react";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

const formatTime = (value) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const statusClass = {
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-slate-100 text-slate-600",
};

const Invitations = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");

  const fetchInvitations = async () => {
    try {
      const { data } = await api.get("/invitations/my");
      setInvitations(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load invitations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();

    const refresh = () => fetchInvitations();
    window.addEventListener("room-invitation-status-updated", refresh);

    return () => {
      window.removeEventListener("room-invitation-status-updated", refresh);
    };
  }, []);

  const updateInvitation = async (invitationId, status) => {
    setUpdatingId(invitationId);
    setError("");

    try {
      const { data } = await api.patch(`/invitations/${invitationId}`, { status });
      setInvitations((currentInvitations) =>
        currentInvitations.map((invitation) => (invitation.id === invitationId ? data : invitation))
      );
      window.dispatchEvent(new CustomEvent("room-invitation-status-updated", { detail: data }));
      if (status === "accepted") {
        window.dispatchEvent(new Event("room-invitation-accepted"));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not update invitation.");
    } finally {
      setUpdatingId("");
    }
  };

  const pendingCount = invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.invitedUser?.id === user?.id
  ).length;

  return (
    <section className="space-y-6">
      <div className="page-hero">
        <p className="section-kicker">Collaboration Requests</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">Invitations</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Room invitations live here so notifications stay focused on personal alerts.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="status-pill">
            <ClipboardList className="h-3.5 w-3.5 text-lavender-500" />
            {pendingCount} pending
          </span>
          <span className="status-pill">
            <Clock3 className="h-3.5 w-3.5 text-mint-500" />
            Latest first
          </span>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section className="soft-panel p-5">
        <div className="scroll-panel max-h-[34rem] space-y-3">
          {isLoading ? (
            <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading invitations...</p>
          ) : invitations.length ? (
            invitations.map((invitation) => {
              const isIncoming = invitation.invitedUser?.id === user?.id;
              const canRespond = isIncoming && invitation.status === "pending";

              return (
                <div key={invitation.id} className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-black text-navy-900">{invitation.room?.name || "Room"}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${statusClass[invitation.status] || statusClass.rejected}`}>
                          {invitation.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {isIncoming
                          ? `Invited by ${invitation.invitedBy?.name || "Unknown"}`
                          : `Sent to ${invitation.invitedUser?.name || "User"}`}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">{invitation.description || "No description provided."}</p>
                      <time className="mt-2 block text-xs text-slate-500" dateTime={invitation.createdAt}>
                        {formatTime(invitation.createdAt)}
                      </time>
                    </div>

                    {canRespond && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateInvitation(invitation.id, "accepted")}
                          disabled={updatingId === invitation.id}
                          className="btn-primary px-3"
                        >
                          <Check className="h-4 w-4" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => updateInvitation(invitation.id, "rejected")}
                          disabled={updatingId === invitation.id}
                          className="btn-secondary px-3"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-8 text-center">
              <ClipboardList className="mx-auto mb-2 h-7 w-7 text-lavender-500" />
              <p className="text-sm font-black text-navy-900">No invitations yet</p>
              <p className="mt-1 text-sm text-slate-500">Room invitations will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
};

export default Invitations;
