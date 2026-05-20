import { useEffect, useRef, useState } from "react";
import { MessageSquare, SendHorizonal, Wifi } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../hooks/useAuth";

const formatTime = (value) => {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const ChatBox = ({ roomId, onOnlineUsersChange, onParticipantsChange }) => {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [connectionError, setConnectionError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const socketRef = useRef(null);
  const navigate = useNavigate();
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!roomId || !token) {
      return undefined;
    }

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionError("");
      socket.emit("join-room", { roomId }, (response) => {
        if (!response?.ok) {
          setConnectionError(response?.message || "Could not join room chat.");
        }
      });
    });

    socket.on("connect_error", (error) => {
      setConnectionError(error.message || "Could not connect to chat.");
    });

    socket.on("room-messages", (roomMessages) => {
      setMessages(roomMessages);
    });

    socket.on("message", (message) => {
      setMessages((currentMessages) => [...currentMessages, message]);
    });

    const handleTypingStart = ({ user: typingUser }) => {
      setTypingUsers((currentUsers) => {
        if (currentUsers.some((currentUser) => currentUser.id === typingUser.id)) {
          return currentUsers;
        }

        return [...currentUsers, typingUser];
      });
    };

    const handleTypingStop = ({ user: stoppedUser }) => {
      setTypingUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.id !== stoppedUser.id)
      );
    };

    socket.on("typing-start", handleTypingStart);
    socket.on("typing-stop", handleTypingStop);

    socket.on("online-users", ({ users }) => {
      onOnlineUsersChange?.(users);
    });

    socket.on("room-participants", ({ participants }) => {
      onParticipantsChange?.(participants);
    });

    socket.on("user-muted", ({ userId }) => {
      if (userId === user?.id) setIsMuted(true);
    });

    socket.on("user-unmuted", ({ userId }) => {
      if (userId === user?.id) setIsMuted(false);
    });

    socket.on("kicked", ({ roomId: evRoomId, message }) => {
      if (evRoomId === roomId && user?.id) {
        setConnectionError(message || "You were removed from the room.");
        navigate("/rooms", { replace: true });
      }
    });

    // direct moderation messages for this user
    socket.on("force-mute", ({ roomId: evRoomId }) => {
      if (evRoomId === roomId) setIsMuted(true);
    });

    socket.on("force-unmute", ({ roomId: evRoomId }) => {
      if (evRoomId === roomId) setIsMuted(false);
    });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      socket.emit("typing-stop", { roomId });
      socket.emit("leave-room", { roomId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, token, onOnlineUsersChange, onParticipantsChange, navigate, user?.id]);

  const handleChange = (event) => {
    setMessageText(event.target.value);
    socketRef.current?.emit("typing-start", { roomId });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing-stop", { roomId });
    }, 900);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!messageText.trim()) {
      return;
    }

    socketRef.current?.emit("message", { roomId, content: messageText }, (response) => {
      if (!response?.ok) {
        setConnectionError(response?.message || "Could not send message.");
      }
    });

    socketRef.current?.emit("typing-stop", { roomId });
    setMessageText("");
  };

  const typingNames = typingUsers
    .filter((typingUser) => typingUser.id !== user?.id)
    .map((typingUser) => typingUser.name);

  return (
    <section className="soft-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="icon-chip h-9 w-9">
              <MessageSquare className="h-4 w-4" />
            </span>
            <h2 className="font-black text-navy-900">Chat</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Realtime room messages</p>
        </div>
        <span className="status-pill bg-mint-300/35">
          <Wifi className="h-3.5 w-3.5 text-mint-500" />
          Live
        </span>
      </div>

      {connectionError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {connectionError}
        </div>
      )}

      <div className="scroll-panel mt-4 flex h-80 flex-col gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-white/70 to-lavender-200/20 p-3 shadow-inner">
        {messages.length === 0 ? (
          <div className="grid flex-1 place-items-center text-center text-sm text-slate-500">
            No messages yet.
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.sender?.id === user?.id;

            return (
              <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${
                    isMine ? "bg-navy-900 text-white" : "bg-white/90 text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{message.sender?.name || "Unknown"}</p>
                    <time
                      className={`text-xs ${isMine ? "text-slate-300" : "text-slate-500"}`}
                      dateTime={message.createdAt}
                    >
                      {formatTime(message.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm">{message.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 min-h-5 text-sm text-slate-500">
        {typingNames.length > 0 &&
          `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`}
        {typingNames.length > 0 && <span className="ml-1 inline-block animate-pulseSoft">...</span>}
      </div>
      {isMuted && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You have been muted by a moderator.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2 rounded-2xl border border-white/70 bg-white/80 p-2 shadow-soft backdrop-blur">
        <input
          type="text"
          value={messageText}
          onChange={handleChange}
          placeholder="Type a message"
          disabled={isMuted}
          className={`min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-3 py-2 outline-none focus:border-lavender-200 focus:bg-white/70 ${
            isMuted ? "bg-slate-100 cursor-not-allowed" : ""
          }`}
        />
        <button
          type="submit"
          disabled={isMuted}
          className={`btn-primary px-4 ${
            isMuted ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <SendHorizonal className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </section>
  );
};

export default ChatBox;
