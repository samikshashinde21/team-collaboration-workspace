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
};

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const getReference = (activity) => {
  if (activity.meeting) {
    return `Meeting ${activity.meeting.id.slice(-6)}`;
  }

  if (activity.room) {
    return activity.room.name;
  }

  return "Workspace";
};

const ActivityTimeline = ({ activities, emptyTitle = "No activity yet", compact = false }) => {
  if (!activities.length) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">New workspace events will appear here.</p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {activities.map((activity) => (
        <article
          key={activity.id}
          className="relative rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-900" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {activity.actor?.name || "Unknown user"}
                  <span className="font-medium text-slate-600">
                    {" "}
                    {actionLabels[activity.action] || activity.action}
                  </span>
                </p>
                <time className="shrink-0 text-xs text-slate-500" dateTime={activity.timestamp}>
                  {formatDateTime(activity.timestamp)}
                </time>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {getReference(activity)}
                </span>
                {activity.targetUser && <span>Target: {activity.targetUser.name}</span>}
              </div>
              {activity.description && (
                <p className="mt-2 text-sm text-slate-600">{activity.description}</p>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
};

export default ActivityTimeline;
