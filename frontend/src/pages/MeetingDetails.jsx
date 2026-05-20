import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  SendHorizonal,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

const peerConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const mediaErrorMessage = "No camera/microphone found. Please connect a device or allow permissions.";

const formatTime = (value) =>
  new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const MeetingDetails = () => {
  const { roomId, meetingId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const targetSocketIdRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUserName, setRemoteUserName] = useState("");
  const [status, setStatus] = useState("Joining meeting...");
  const [error, setError] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const getMediaStream = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      } catch (audioError) {
        throw new Error(mediaErrorMessage, { cause: audioError });
      }
    }
  };

  const resetPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    targetSocketIdRef.current = null;
    setRemoteStream(null);
    setRemoteUserName("");
  }, []);

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    setLocalStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
  }, []);

  const leaveSocketMeeting = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    socketRef.current?.emit("typing-stop", { roomId, meetingId });
    socketRef.current?.emit("leave-meeting", { roomId, meetingId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    resetPeerConnection();
    cleanupMedia();
  }, [cleanupMedia, meetingId, resetPeerConnection, roomId]);

  const createPeerConnection = useCallback(
    (targetSocketId) => {
      resetPeerConnection();
      targetSocketIdRef.current = targetSocketId;

      const peerConnection = new RTCPeerConnection(peerConfig);
      peerConnectionRef.current = peerConnection;

      localStreamRef.current?.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && targetSocketIdRef.current) {
          socketRef.current?.emit("ice-candidate", {
            roomId,
            meetingId,
            targetSocketId: targetSocketIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;

        if (stream) {
          setRemoteStream(stream);
          setStatus("Connected to remote participant.");
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setStatus("Connected to remote participant.");
        }

        if (["disconnected", "failed", "closed"].includes(peerConnection.connectionState)) {
          setStatus("Remote participant disconnected.");
        }
      };

      return peerConnection;
    },
    [meetingId, resetPeerConnection, roomId]
  );

  const registerSocketEvents = useCallback(
    (socket) => {
      socket.on("connect_error", (socketError) => {
        setError(socketError.message || "Could not connect to meeting signaling.");
        setStatus("Meeting signaling failed.");
      });

      socket.on("meeting-messages", (meetingMessages) => {
        setMessages(meetingMessages);
      });

      socket.on("meeting-message", (message) => {
        setMessages((currentMessages) => [...currentMessages, message]);
      });

      socket.on("typing-start", ({ scope, user: typingUser }) => {
        if (scope !== "meeting" || !typingUser || typingUser.id === user?.id) return;

        setTypingUsers((currentUsers) => {
          if (currentUsers.some((currentUser) => currentUser.id === typingUser.id)) {
            return currentUsers;
          }

          return [...currentUsers, typingUser];
        });
      });

      socket.on("typing-stop", ({ scope, user: stoppedUser }) => {
        if (scope !== "meeting" || !stoppedUser) return;

        setTypingUsers((currentUsers) =>
          currentUsers.filter((currentUser) => currentUser.id !== stoppedUser.id)
        );
      });

      socket.on("call-user-joined", ({ user: joinedUser, socketId, users }) => {
        setParticipants(users || []);
        setRemoteUserName(joinedUser?.name || "Remote participant");
        setStatus(`${joinedUser?.name || "A participant"} joined the meeting.`);
        targetSocketIdRef.current = socketId;
      });

      socket.on("meeting-participants", ({ users }) => {
        setParticipants(users || []);
      });

      socket.on("call-user-left", ({ socketId, users }) => {
        setParticipants(users || []);

        if (!targetSocketIdRef.current || targetSocketIdRef.current === socketId) {
          resetPeerConnection();
          setStatus("Remote participant left the meeting.");
        }
      });

      socket.on("offer", async ({ offer, fromSocketId, user: remoteUser }) => {
        try {
          setRemoteUserName(remoteUser?.name || "Remote participant");
          const peerConnection = createPeerConnection(fromSocketId);

          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit("answer", {
            roomId,
            meetingId,
            targetSocketId: fromSocketId,
            answer,
          });

          setStatus("Answer sent. Connecting...");
        } catch {
          setError("Could not answer the incoming meeting call.");
        }
      });

      socket.on("answer", async ({ answer }) => {
        try {
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
          setStatus("Answer received. Connecting...");
        } catch {
          setError("Could not complete the meeting answer.");
        }
      });

      socket.on("ice-candidate", async ({ candidate }) => {
        try {
          if (peerConnectionRef.current && candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch {
          setError("Could not add network candidate for the meeting.");
        }
      });

      socket.on("screen-share-start", ({ user: sharingUser }) => {
        setStatus(`${sharingUser?.name || "A participant"} started screen sharing.`);
      });

      socket.on("screen-share-stop", ({ user: sharingUser }) => {
        setStatus(`${sharingUser?.name || "A participant"} stopped screen sharing.`);
      });

      socket.on("screen-share-error", ({ message }) => {
        setError(message || "Could not share screen.");
      });

      socket.on("meeting-ended", () => {
        leaveSocketMeeting();
        navigate(`/rooms/${roomId}`, { replace: true });
      });
    },
    [createPeerConnection, leaveSocketMeeting, meetingId, navigate, resetPeerConnection, roomId, user?.id]
  );

  useEffect(() => {
    let isMounted = true;

    const joinMeeting = async () => {
      if (!roomId || !meetingId || !token) return;

      try {
        const [{ data: meetingData }, stream] = await Promise.all([
          api.get(`/rooms/${roomId}/meetings/${meetingId}`),
          getMediaStream(),
        ]);

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (meetingData.status === "ended") {
          navigate(`/rooms/${roomId}`, { replace: true });
          return;
        }

        setMeeting(meetingData);
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        setLocalStream(stream);
        setIsCameraOn(stream.getVideoTracks().some((track) => track.enabled));
        setIsMicOn(stream.getAudioTracks().some((track) => track.enabled));

        const socket = io("http://localhost:5000", { auth: { token } });
        socketRef.current = socket;
        registerSocketEvents(socket);

        socket.on("connect", () => {
          socket.emit("join-meeting", { roomId, meetingId }, async (response) => {
            if (!response?.ok) {
              setError(response?.message || "Could not join the meeting.");
              leaveSocketMeeting();
              return;
            }

            const existingUsers = response.users || [];
            setParticipants([
              ...existingUsers,
              { socketId: socket.id, id: user?.id, name: user?.name, email: user?.email, role: user?.role },
            ]);

            const [existingUser] = existingUsers;

            if (!existingUser) {
              setStatus("Waiting for another participant...");
              return;
            }

            targetSocketIdRef.current = existingUser.socketId;
            setRemoteUserName(existingUser.name || "Remote participant");

            const peerConnection = createPeerConnection(existingUser.socketId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socket.emit("offer", {
              roomId,
              meetingId,
              targetSocketId: existingUser.socketId,
              offer,
            });

            setStatus("Offer sent. Waiting for answer...");
          });
        });
      } catch (err) {
        setError(err.response?.data?.message || err.message || mediaErrorMessage);
        setStatus("Unable to join meeting.");
      }
    };

    joinMeeting();

    return () => {
      isMounted = false;
      leaveSocketMeeting();
    };
  }, [createPeerConnection, leaveSocketMeeting, meetingId, navigate, registerSocketEvents, roomId, token, user]);

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];

    if (!videoTrack) {
      setError("Camera is not available on this device or permission was denied.");
      return;
    }

    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraOn(videoTrack.enabled);
  };

  const toggleMicrophone = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];

    if (!audioTrack) {
      setError("Microphone is not available on this device or permission was denied.");
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    setIsMicOn(audioTrack.enabled);
  };

  const stopScreenShare = useCallback(() => {
    const sender = peerConnectionRef.current
      ?.getSenders()
      .find((peerSender) => peerSender.track?.kind === "video");

    if (cameraTrackRef.current && sender) {
      sender.replaceTrack(cameraTrackRef.current);
    }

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    socketRef.current?.emit("screen-share-stop", { roomId, meetingId });
  }, [meetingId, roomId]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((peerSender) => peerSender.track?.kind === "video");

      if (sender && screenTrack) {
        await sender.replaceTrack(screenTrack);
      }

      screenTrack.onended = stopScreenShare;
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);
      socketRef.current?.emit("screen-share-start", { roomId, meetingId });
    } catch {
      setError("Could not start screen sharing.");
    }
  };

  const handleSendMessage = (event) => {
    event.preventDefault();

    if (!messageText.trim()) return;

    socketRef.current?.emit(
      "meeting-message",
      { roomId, meetingId, content: messageText },
      (response) => {
        if (!response?.ok) {
          setError(response?.message || "Could not send meeting message.");
        }
      }
    );
    socketRef.current?.emit("typing-stop", { roomId, meetingId });
    setMessageText("");
  };

  const handleMessageTextChange = (event) => {
    setMessageText(event.target.value);
    socketRef.current?.emit("typing-start", { roomId, meetingId });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing-stop", { roomId, meetingId });
    }, 900);
  };

  const handleLeaveMeeting = async () => {
    setIsEnding(true);

    if (user?.role === "admin" || user?.role === "moderator") {
      try {
        await api.patch(`/rooms/${roomId}/meetings/${meetingId}/end`);
      } catch (err) {
        setError(err.response?.data?.message || "Could not end meeting.");
      }
    }

    leaveSocketMeeting();
    navigate(`/rooms/${roomId}`, { replace: true });
  };

  const activeParticipants = participants.filter(
    (participant, index, list) => participant?.id && list.findIndex((item) => item.id === participant.id) === index
  );
  const fallbackActiveParticipants =
    meeting?.participants
      ?.filter((participant) => !participant.leftAt && participant.user)
      .map((participant) => participant.user) || [];
  const visibleParticipants = activeParticipants.length ? activeParticipants : fallbackActiveParticipants;
  const typingNames = typingUsers.map((typingUser) => typingUser.name);

  return (
    <section className="fixed inset-0 z-50 flex overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-soft-grid opacity-20 [background-size:36px_36px]" />
      <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-[5rem] bg-lavender-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-16 h-72 w-72 rounded-[5rem] bg-mint-500/20 blur-3xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex flex-col gap-3 border-b border-white/10 bg-white/5 px-5 py-4 backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link to={`/rooms/${roomId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
              <ChevronLeft className="h-4 w-4" />
              Back to room
            </Link>
            <h1 className="mt-1 truncate text-xl font-semibold">Meeting room</h1>
            <p className="mt-1 text-sm text-slate-300">{status}</p>
          </div>
          <div className="hidden flex-wrap gap-2 lg:flex">
            <button
              type="button"
              onClick={toggleMicrophone}
              className={`btn-secondary ${
                isMicOn ? "bg-white text-navy-950" : "border-white/10 bg-white/10 text-white"
              }`}
            >
              {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {isMicOn ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className={`btn-secondary ${
                isCameraOn ? "bg-white text-navy-950" : "border-white/10 bg-white/10 text-white"
              }`}
            >
              {isCameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              {isCameraOn ? "Camera off" : "Camera on"}
            </button>
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`btn-secondary ${
                isScreenSharing ? "border-mint-300 bg-mint-300 text-navy-950" : "border-white/10 bg-white/10 text-white"
              }`}
            >
              <MonitorUp className="h-4 w-4" />
              {isScreenSharing ? "Stop sharing" : "Share screen"}
            </button>
            <button
              type="button"
              onClick={handleLeaveMeeting}
              disabled={isEnding}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
            >
              <PhoneOff className="h-4 w-4" />
              {isEnding ? "Leaving..." : user?.role === "admin" || user?.role === "moderator" ? "End meeting" : "Leave meeting"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="relative z-10 grid min-h-0 flex-1 gap-4 p-5 pb-24 lg:grid-cols-[1fr_340px]">
          <div className="grid min-h-0 gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-lift backdrop-blur-xl ring-2 ring-mint-300/20">
              <div className="flex items-center justify-between bg-black/20 px-3 py-2 text-sm text-slate-200">
                <span>You</span>
                <span className="inline-flex items-center gap-1">{isMicOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}{isMicOn ? "Mic on" : "Mic off"}</span>
              </div>
              <div className="grid aspect-video place-items-center bg-black">
                {localStream ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                ) : (
                  <p className="px-4 text-center text-sm text-slate-400">Local media preview</p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-lift backdrop-blur-xl">
              <div className="flex items-center justify-between bg-black/30 px-3 py-2 text-sm text-slate-200">
                <span>{remoteUserName || "Remote participant"}</span>
                <span>{remoteStream ? "Connected" : "Waiting"}</span>
              </div>
              <div className="grid aspect-video place-items-center bg-black">
                {remoteStream ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                ) : (
                  <p className="px-4 text-center text-sm text-slate-400">
                    Remote video/audio appears when another participant joins.
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col rounded-2xl border border-white/25 bg-white/90 text-slate-950 shadow-lift backdrop-blur-2xl">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 font-black text-navy-900">
                  <Users className="h-4 w-4" />
                  Participants
                </h2>
                <span className="status-pill">
                  {visibleParticipants.length} total
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {visibleParticipants.map(
                  (participant) => (
                    <div key={participant.id} className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-lavender-200/20 px-3 py-2 shadow-sm">
                      <p className="truncate text-sm font-medium text-slate-900">{participant.name}</p>
                      <p className="truncate text-xs text-slate-500 capitalize">{participant.role || "participant"}</p>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
              <h2 className="font-black text-navy-900">Meeting chat</h2>
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-violet-100 bg-gradient-to-br from-white/80 to-lavender-200/20 p-3">
                {messages.length ? (
                  messages.map((message) => {
                    const isMine = message.sender?.id === user?.id;

                    return (
                      <div key={message.id} className={isMine ? "text-right" : "text-left"}>
                        <div
                          className={`inline-block max-w-[88%] rounded-2xl px-3 py-2 shadow-sm ${
                            isMine ? "bg-navy-900 text-white" : "bg-white/95 text-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{message.sender?.name || "Unknown"}</span>
                            <time className={isMine ? "text-slate-300" : "text-slate-500"} dateTime={message.createdAt}>
                              {formatTime(message.createdAt)}
                            </time>
                          </div>
                          <p className="mt-1 text-sm">{message.content}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid flex-1 place-items-center text-center text-sm text-slate-500">
                    No meeting messages yet.
                  </div>
                )}
              </div>

              <div className="mt-2 min-h-5 text-sm text-slate-500">
                {typingNames.length > 0 &&
                  `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`}
              </div>

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-2 rounded-2xl border border-violet-100 bg-white/85 p-2 shadow-soft">
                <input
                  type="text"
                  value={messageText}
                  onChange={handleMessageTextChange}
                  placeholder="Message meeting"
                  className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm outline-none focus:border-lavender-200 focus:bg-white"
                />
                <button type="submit" className="btn-primary px-4">
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>
      <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-lift backdrop-blur-2xl lg:hidden">
        <button type="button" onClick={toggleMicrophone} className="rounded-xl bg-white/15 p-3 text-white">
          {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button type="button" onClick={toggleCamera} className="rounded-xl bg-white/15 p-3 text-white">
          {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </button>
        <button type="button" onClick={toggleScreenShare} className="rounded-xl bg-white/15 p-3 text-white">
          <MonitorUp className="h-5 w-5" />
        </button>
        <button type="button" onClick={handleLeaveMeeting} className="rounded-xl bg-red-600 p-3 text-white">
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};

export default MeetingDetails;
