import { Activity, Clock3 } from "lucide-react";

const actionLabels = {
  USER_LOGIN: "logged in",
  ROOM_CREATED: "created a room",
  ROOM_DELETED: "deleted a room",
  ROOM_JOINED: "joined a room",
  ROOM_LEFT: "left a room",
  INVITATION_SENT: "sent an invitation",
  INVITATION_ACCEPTED: "accepted an invitation",
  INVITATION_REJECTED: "rejected an invitation",
  MEETING_STARTED: "started a meeting",
  MEETING_ENDED: "ended a meeting",
  USER_MUTED: "muted a user",
  USER_UNMUTED: "unmuted a user",
  USER_KICKED: "removed a user",
  SCREEN_SHARE_BLOCKED: "blocked screen sharing",
  SCREEN_SHARE_ALLOWED: "allowed screen sharing",
  USER_ROLE_UPDATED: "updated a role",
};

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatDuration = (seconds = 0) => {
  const minutes = Math.max(Math.round(seconds / 60), 0);

  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const getReference = (activity) => {
  if (activity.room) {
    return activity.room.name;
  }

  if (activity.meeting) {
    return `Meeting ${activity.meeting.id.slice(-6)}`;
  }

  return "Workspace";
};

const getActivityTitle = (activity) => {
  if (activity.action === "MEETING_ENDED") {
    const duration = formatDuration(activity.meeting?.durationSeconds);
    const participantCount = activity.meeting?.participantCount || 0;
    const participantLabel = participantCount === 1 ? "participant" : "participants";

    return `${activity.room?.name || "Meeting"} ended - ${duration} - ${participantCount} ${participantLabel}`;
  }

  if (activity.action === "MEETING_STARTED") return `${activity.room?.name || "Meeting"} started`;
  if (activity.action === "ROOM_CREATED") return `${activity.room?.name || "Room"} created`;
  if (activity.action === "ROOM_DELETED") return activity.description || "Room deleted";
  if (activity.action === "INVITATION_ACCEPTED") return activity.description || "Invitation accepted";
  if (activity.action === "INVITATION_REJECTED") return activity.description || "Invitation rejected";

  return activity.description || `${activity.actor?.name || "Unknown user"} ${actionLabels[activity.action] || activity.action}`;
};

const ActivityTimeline = ({ activities, emptyTitle = "No activity yet", compact = false }) => {
  if (!activities.length) {
    return (
      <div className="rounded-2xl border border-dashed border-lavender-200 bg-white/55 px-4 py-8 text-center shadow-sm backdrop-blur">
        <Activity className="mx-auto mb-3 h-8 w-8 text-lavender-500" />
        <p className="text-sm font-bold text-navy-900">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">New workspace events will appear here.</p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {activities.map((activity) => {
        const title = getActivityTitle(activity);

        return (
          <article
            key={activity.id}
            className="relative rounded-2xl border border-white/75 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-soft"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lavender-200 to-mint-300 text-navy-900">
                <Activity className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold text-navy-900">{title}</p>
                  <time className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" dateTime={activity.timestamp}>
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatDateTime(activity.timestamp)}
                  </time>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="status-pill px-2 py-0.5">{getReference(activity)}</span>
                  <span>{activity.actor?.name || "System"}</span>
                  {activity.targetUser && <span>Target: {activity.targetUser.name}</span>}
                </div>
                {activity.description && activity.description !== title && activity.action !== "MEETING_ENDED" && (
                  <p className="mt-2 text-sm text-slate-600">{activity.description}</p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default ActivityTimeline;
