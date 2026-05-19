import { useCallback, useEffect, useRef, useState } from "react";
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
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUserName, setRemoteUserName] = useState("");
  const [status, setStatus] = useState("Joining meeting...");
  const [error, setError] = useState("");
  const [isEnding, setIsEnding] = useState(false);

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
    socketRef.current?.emit("leave-call", { roomId, meetingId });
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

      socket.on("call-user-joined", ({ user: joinedUser, socketId, users }) => {
        setParticipants(users || []);
        setRemoteUserName(joinedUser?.name || "Remote participant");
        setStatus(`${joinedUser?.name || "A participant"} joined the meeting.`);
        targetSocketIdRef.current = socketId;
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
    [createPeerConnection, leaveSocketMeeting, meetingId, navigate, resetPeerConnection, roomId]
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
          socket.emit("join-call", { roomId, meetingId }, async (response) => {
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
    setMessageText("");
  };

  const handleLeaveMeeting = async () => {
    setIsEnding(true);

    try {
      await api.patch(`/rooms/${roomId}/meetings/${meetingId}/end`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not end meeting.");
    } finally {
      leaveSocketMeeting();
      navigate(`/rooms/${roomId}`, { replace: true });
    }
  };

  const activeParticipants = participants.filter(
    (participant, index, list) => participant?.id && list.findIndex((item) => item.id === participant.id) === index
  );

  return (
    <section className="fixed inset-0 z-50 flex bg-slate-950 text-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link to={`/rooms/${roomId}`} className="text-sm font-medium text-slate-300 hover:text-white">
              Back to room
            </Link>
            <h1 className="mt-1 truncate text-xl font-semibold">Meeting room</h1>
            <p className="mt-1 text-sm text-slate-300">{status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleMicrophone}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isMicOn ? "bg-white text-slate-950" : "bg-slate-800 text-white ring-1 ring-white/10"
              }`}
            >
              {isMicOn ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isCameraOn ? "bg-white text-slate-950" : "bg-slate-800 text-white ring-1 ring-white/10"
              }`}
            >
              {isCameraOn ? "Camera off" : "Camera on"}
            </button>
            <button
              type="button"
              onClick={toggleScreenShare}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isScreenSharing ? "bg-sky-500 text-white" : "bg-slate-800 text-white ring-1 ring-white/10"
              }`}
            >
              {isScreenSharing ? "Stop sharing" : "Share screen"}
            </button>
            <button
              type="button"
              onClick={handleLeaveMeeting}
              disabled={isEnding}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
            >
              {isEnding ? "Leaving..." : "Leave meeting"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[1fr_340px]">
          <div className="grid min-h-0 gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900">
              <div className="flex items-center justify-between bg-black/30 px-3 py-2 text-sm text-slate-200">
                <span>You</span>
                <span>{isMicOn ? "Mic on" : "Mic off"}</span>
              </div>
              <div className="grid aspect-video place-items-center bg-black">
                {localStream ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                ) : (
                  <p className="px-4 text-center text-sm text-slate-400">Local media preview</p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900">
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

          <aside className="flex min-h-0 flex-col rounded-lg border border-white/10 bg-white text-slate-950">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Participants</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {Math.max(activeParticipants.length, meeting?.participants?.length || 0)} total
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(activeParticipants.length ? activeParticipants : meeting?.participants?.map((item) => item.user) || []).map(
                  (participant) => (
                    <div key={participant.id} className="rounded-md bg-slate-50 px-3 py-2">
                      <p className="truncate text-sm font-medium text-slate-900">{participant.name}</p>
                      <p className="truncate text-xs text-slate-500 capitalize">{participant.role || "participant"}</p>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
              <h2 className="font-semibold">Meeting chat</h2>
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {messages.length ? (
                  messages.map((message) => {
                    const isMine = message.sender?.id === user?.id;

                    return (
                      <div key={message.id} className={isMine ? "text-right" : "text-left"}>
                        <div
                          className={`inline-block max-w-[88%] rounded-lg px-3 py-2 ${
                            isMine ? "bg-slate-900 text-white" : "bg-white text-slate-900"
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

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Message meeting"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                  Send
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default MeetingDetails;