import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  Circle,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Send,
  Users,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../api/api";
import AppFooter from "../components/AppFooter";
import { useAuth } from "../hooks/useAuth";

const peerConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const formatTime = (value) =>
  new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const getInitials = (name = "Participant") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const getParticipantId = (participant) => participant?.id || participant?._id || participant?.user?.id;

const normalizeParticipant = (participant) => {
  const user = participant?.user || participant || {};

  return {
    socketId: participant?.socketId,
    id: getParticipantId(participant),
    name: user.name || participant?.name || "Participant",
    email: user.email || participant?.email,
    role: user.role || participant?.role || "participant",
    avatarUrl: user.avatarUrl || participant?.avatarUrl || "",
    micOn: !!participant?.micOn,
    cameraOn: !!participant?.cameraOn,
    screenSharing: !!participant?.screenSharing,
    speaking: !!participant?.speaking,
    live: participant?.live ?? !participant?.leftAt,
  };
};

const StatusIcon = ({ active, children, label }) => (
  <span
    title={label}
    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
      active ? "border-mint-300 bg-mint-300/25 text-mint-300" : "border-white/10 bg-white/10 text-slate-400"
    }`}
  >
    {children}
  </span>
);

const MeetingDetails = () => {
  const { roomId, meetingId } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const targetSocketIdRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const toastTimeoutsRef = useRef(new Map());
  const mediaStateRef = useRef({ micOn: false, cameraOn: false, screenSharing: false });
  const sidePanelRef = useRef(null);
  const audioContextRef = useRef(null);
  const voiceFrameRef = useRef(null);
  const speakingStateRef = useRef(false);
  const [meeting, setMeeting] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [status, setStatus] = useState("Joining meeting...");
  const [error, setError] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  const [sidePanel, setSidePanel] = useState(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [moderatingParticipantId, setModeratingParticipantId] = useState("");

  const isMeetingModerator = user?.role === "admin" || user?.role === "moderator";

  useEffect(() => {
    mediaStateRef.current = {
      micOn: isMicOn,
      cameraOn: isCameraOn,
      screenSharing: isScreenSharing,
    };
  }, [isCameraOn, isMicOn, isScreenSharing]);

  useEffect(() => {
    sidePanelRef.current = sidePanel;
  }, [sidePanel]);

  const addToast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((currentToasts) => [...currentToasts.slice(-2), { id, message }]);
    const timeout = setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
      toastTimeoutsRef.current.delete(id);
    }, 3200);
    toastTimeoutsRef.current.set(id, timeout);
  }, []);

  const emitMediaState = useCallback(
    (nextState = {}) => {
      socketRef.current?.emit("meeting-media-state", {
        roomId,
        meetingId,
        micOn: nextState.micOn ?? mediaStateRef.current.micOn,
        cameraOn: nextState.cameraOn ?? mediaStateRef.current.cameraOn,
        screenSharing: nextState.screenSharing ?? mediaStateRef.current.screenSharing,
      });
    },
    [meetingId, roomId]
  );

  const setSelfParticipantState = useCallback(
    (nextState) => {
      setParticipants((currentParticipants) => {
        const normalizedUser = {
          socketId: socketRef.current?.id,
          id: user?.id,
          name: user?.name,
          email: user?.email,
          role: user?.role,
          live: true,
        };
        const hasSelf = currentParticipants.some((participant) => getParticipantId(participant) === user?.id);
        const nextParticipants = hasSelf ? currentParticipants : [...currentParticipants, normalizedUser];

        return nextParticipants.map((participant) =>
          getParticipantId(participant) === user?.id ? { ...participant, ...nextState } : participant
        );
      });
    },
    [user]
  );

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOn]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (sidePanel === "chat") {
      setUnreadChatCount(0);
    }
  }, [sidePanel]);

  const getMediaStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return new MediaStream();
    }

    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) || [];
    const hasMicrophone = devices.some((device) => device.kind === "audioinput");

    if (!hasMicrophone) {
      return new MediaStream();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      stream.getTracks().forEach((track) => {
        track.enabled = false;
      });
      return stream;
    } catch {
      return new MediaStream();
    }
  };

  const getCameraTrack = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    return stream.getVideoTracks()[0] || null;
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
  }, []);

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    cameraTrackRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
  }, []);

  const leaveSocketMeeting = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    socketRef.current?.emit("typing-stop", { roomId, meetingId });
    socketRef.current?.emit("meeting-speaking-state", { roomId, meetingId, speaking: false });
    socketRef.current?.emit("leave-meeting", { roomId, meetingId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    resetPeerConnection();
    cleanupMedia();
  }, [cleanupMedia, meetingId, resetPeerConnection, roomId]);

  useEffect(() => {
    const audioTrack = localStream?.getAudioTracks()[0];

    if (!isMicOn || !audioTrack || !localStream) {
      if (speakingStateRef.current) {
        speakingStateRef.current = false;
        socketRef.current?.emit("meeting-speaking-state", { roomId, meetingId, speaking: false });
        setSelfParticipantState({ speaking: false });
      }

      return undefined;
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return undefined;
    }

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    let quietFrames = 0;

    audioContextRef.current = audioContext;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);

    const setSpeaking = (speaking) => {
      if (speakingStateRef.current === speaking) return;

      speakingStateRef.current = speaking;
      socketRef.current?.emit("meeting-speaking-state", { roomId, meetingId, speaking });
      setSelfParticipantState({ speaking });
    };

    const measureVoice = () => {
      analyser.getByteTimeDomainData(samples);
      const volume =
        samples.reduce((sum, sample) => {
          const centeredSample = sample - 128;
          return sum + centeredSample * centeredSample;
        }, 0) / samples.length;

      if (volume > 95) {
        quietFrames = 0;
        setSpeaking(true);
      } else {
        quietFrames += 1;
        if (quietFrames > 12) {
          setSpeaking(false);
        }
      }

      voiceFrameRef.current = window.requestAnimationFrame(measureVoice);
    };

    measureVoice();

    return () => {
      if (voiceFrameRef.current) {
        window.cancelAnimationFrame(voiceFrameRef.current);
        voiceFrameRef.current = null;
      }

      source.disconnect();
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
      setSpeaking(false);
    };
  }, [isMicOn, localStream, meetingId, roomId, setSelfParticipantState]);

  const createPeerConnection = useCallback(
    (targetSocketId) => {
      resetPeerConnection();
      targetSocketIdRef.current = targetSocketId;

      const peerConnection = new RTCPeerConnection(peerConfig);
      peerConnectionRef.current = peerConnection;

      localStreamRef.current?.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      const videoTrack = screenTrack || cameraTrack;
      const videoStream = screenTrack ? screenStreamRef.current : localStreamRef.current;

      if (videoTrack && videoStream) {
        peerConnection.addTrack(videoTrack, videoStream);
      }

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

  const renegotiatePeerConnection = async () => {
    if (!peerConnectionRef.current || !targetSocketIdRef.current) return;

    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);
    socketRef.current?.emit("offer", {
      roomId,
      meetingId,
      targetSocketId: targetSocketIdRef.current,
      offer,
    });
  };

  const callParticipant = useCallback(
    async (targetSocketId, targetName = "participant") => {
      if (!targetSocketId) return;

      targetSocketIdRef.current = targetSocketId;
      const peerConnection = createPeerConnection(targetSocketId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socketRef.current?.emit("offer", {
        roomId,
        meetingId,
        targetSocketId,
        offer,
      });

      setStatus(`Connecting to ${targetName}...`);
    },
    [createPeerConnection, meetingId, roomId]
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
        if (message.sender?.id !== user?.id && sidePanelRef.current !== "chat") {
          setUnreadChatCount((count) => count + 1);
        }
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

        setTypingUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== stoppedUser.id));
      });

      socket.on("call-user-joined", ({ user: joinedUser, socketId, users }) => {
        setParticipants(users || []);
        setStatus(`${joinedUser?.name || "A participant"} joined the meeting.`);
        addToast(`${joinedUser?.name || "A participant"} joined the meeting`);

        if (mediaStateRef.current.screenSharing) {
          callParticipant(socketId, joinedUser?.name || "participant").catch(() => {
            setError("Could not connect the screen share to the new participant.");
          });
        }
      });

      socket.on("meeting-participants", ({ users }) => {
        setParticipants(users || []);
      });

      socket.on("call-user-left", ({ socketId, user: leftUser, users }) => {
        setParticipants(users || []);
        addToast(`${leftUser?.name || "A participant"} left the meeting`);

        if (!targetSocketIdRef.current || targetSocketIdRef.current === socketId) {
          resetPeerConnection();
          setStatus("Remote participant left the meeting.");
        }
      });

      socket.on("offer", async ({ offer, fromSocketId, user: remoteUser }) => {
        try {
          const peerConnection =
            peerConnectionRef.current && targetSocketIdRef.current === fromSocketId
              ? peerConnectionRef.current
              : createPeerConnection(fromSocketId);

          if (peerConnection.signalingState === "have-local-offer") {
            await peerConnection.setLocalDescription({ type: "rollback" });
          }

          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit("answer", {
            roomId,
            meetingId,
            targetSocketId: fromSocketId,
            answer,
          });

          setStatus(`Connecting to ${remoteUser?.name || "participant"}...`);
        } catch {
          setError("Could not answer the incoming meeting call.");
        }
      });

      socket.on("answer", async ({ answer }) => {
        try {
          if (peerConnectionRef.current?.signalingState !== "have-local-offer") {
            return;
          }

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
        if (sharingUser?.id) {
          setParticipants((currentParticipants) =>
            currentParticipants.map((participant) =>
              getParticipantId(participant) === sharingUser.id
                ? { ...participant, screenSharing: true }
                : { ...participant, screenSharing: false }
            )
          );
        }
        addToast(`${sharingUser?.name || "A participant"} started screen sharing`);
      });

      socket.on("screen-share-stop", ({ user: sharingUser }) => {
        setStatus(`${sharingUser?.name || "A participant"} stopped screen sharing.`);
        if (sharingUser?.id) {
          setParticipants((currentParticipants) =>
            currentParticipants.map((participant) =>
              getParticipantId(participant) === sharingUser.id ? { ...participant, screenSharing: false } : participant
            )
          );
        }
        addToast(`${sharingUser?.name || "A participant"} stopped screen sharing`);
      });

      socket.on("screen-share-error", ({ message }) => {
        setError(message || "Could not share screen.");
      });

      socket.on("meeting-force-mute", ({ message }) => {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
        }
        setIsMicOn(false);
        setSelfParticipantState({ micOn: false });
        emitMediaState({ micOn: false });
        addToast(message || "Your microphone was muted");
      });

      socket.on("meeting-force-camera-off", ({ message }) => {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) {
          const sender = peerConnectionRef.current
            ?.getSenders()
            .find((peerSender) => peerSender.track === videoTrack);

          sender?.replaceTrack(null);
          videoTrack.stop();
          localStreamRef.current.removeTrack(videoTrack);
          cameraTrackRef.current = null;
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          renegotiatePeerConnection().catch(() => {});
        }
        setIsCameraOn(false);
        setSelfParticipantState({ cameraOn: false });
        emitMediaState({ cameraOn: false });
        addToast(message || "Your camera was turned off");
      });

      socket.on("meeting-force-screen-share-stop", async ({ message }) => {
        const sender = peerConnectionRef.current?.getSenders().find((peerSender) => peerSender.track?.kind === "video");

        if (sender) {
          await sender.replaceTrack(cameraTrackRef.current || null);
        }

        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        setSelfParticipantState({ screenSharing: false });
        emitMediaState({ screenSharing: false });
        renegotiatePeerConnection().catch(() => {});
        addToast(message || "Your screen sharing was stopped");
      });

      socket.on("meeting-kicked", ({ message }) => {
        addToast(message || "You were removed from the meeting");
        leaveSocketMeeting();
        navigate(`/rooms/${roomId}`, { replace: true });
      });

      socket.on("meeting-moderation-confirmation", ({ message }) => {
        addToast(message || "Meeting moderation applied");
      });

      socket.on("meeting-ended", () => {
        addToast("Meeting ended");
        leaveSocketMeeting();
        navigate(`/rooms/${roomId}`, { replace: true });
      });
    },
    [addToast, callParticipant, createPeerConnection, emitMediaState, leaveSocketMeeting, meetingId, navigate, resetPeerConnection, roomId, setSelfParticipantState, user?.id]
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
        setStatus("Meeting started");
        addToast("Meeting started");
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
        setLocalStream(stream);
        setIsCameraOn(false);
        setIsMicOn(false);
        setIsScreenSharing(false);

        const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token } });
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
              {
                socketId: socket.id,
                id: user?.id,
                name: user?.name,
                email: user?.email,
                role: user?.role,
                avatarUrl: user?.avatarUrl || "",
                micOn: false,
                cameraOn: false,
                screenSharing: false,
                speaking: false,
                live: true,
              },
            ]);
            emitMediaState({ micOn: false, cameraOn: false, screenSharing: false });

            const existingUser =
              existingUsers.find((existingParticipant) => existingParticipant.screenSharing) || existingUsers[0];

            if (!existingUser) {
              setStatus("Waiting for another participant...");
              return;
            }

            if (existingUser.screenSharing) {
              setStatus(`Waiting for ${existingUser.name || "presenter"}'s screen share...`);
              return;
            }

            await callParticipant(existingUser.socketId, existingUser.name || "participant");
          });
        });
      } catch (err) {
        setError(err.response?.data?.message || err.message || "Could not join the meeting.");
        setStatus("Unable to join meeting.");
      }
    };

    joinMeeting();

    return () => {
      isMounted = false;
      leaveSocketMeeting();
    };
  }, [addToast, createPeerConnection, emitMediaState, leaveSocketMeeting, meetingId, navigate, registerSocketEvents, roomId, token, user]);

  useEffect(
    () => () => {
      toastTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      toastTimeoutsRef.current.clear();
    },
    []
  );

  const updateLocalParticipantState = (nextState) => {
    setSelfParticipantState(nextState);
    emitMediaState(nextState);
  };

  const toggleCamera = async () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];

    if (videoTrack) {
      const sender = peerConnectionRef.current
        ?.getSenders()
        .find((peerSender) => peerSender.track === videoTrack);

      if (sender) {
        await sender.replaceTrack(null);
      }

      videoTrack.stop();
      localStreamRef.current.removeTrack(videoTrack);
      cameraTrackRef.current = null;
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setIsCameraOn(false);
      updateLocalParticipantState({ cameraOn: false });
      renegotiatePeerConnection().catch(() => {});
      return;
    }

    try {
      const cameraTrack = await getCameraTrack();

      if (!cameraTrack) {
        throw new Error("No camera track");
      }

      localStreamRef.current?.addTrack(cameraTrack);
      cameraTrackRef.current = cameraTrack;
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setIsCameraOn(true);
      updateLocalParticipantState({ cameraOn: true });

      if (peerConnectionRef.current) {
        peerConnectionRef.current.addTrack(cameraTrack, localStreamRef.current);
        await renegotiatePeerConnection();
      }
    } catch {
      setError("Camera is not available on this device or permission was denied.");
      updateLocalParticipantState({ cameraOn: false });
    }
  };

  const toggleMicrophone = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];

    if (!audioTrack) {
      setError("Microphone is not available on this device or permission was denied.");
      updateLocalParticipantState({ micOn: false });
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    setIsMicOn(audioTrack.enabled);
    updateLocalParticipantState({ micOn: audioTrack.enabled });
  };

  const stopScreenShare = useCallback(() => {
    const sender = peerConnectionRef.current?.getSenders().find((peerSender) => peerSender.track?.kind === "video");

    if (sender) {
      sender.replaceTrack(cameraTrackRef.current || null);
    }

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    updateLocalParticipantState({ screenSharing: false });
    socketRef.current?.emit("screen-share-stop", { roomId, meetingId });
    renegotiatePeerConnection().catch(() => {});
  }, [meetingId, roomId]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current?.getSenders().find((peerSender) => peerSender.track?.kind === "video");

      if (sender && screenTrack) {
        await sender.replaceTrack(screenTrack);
      } else if (peerConnectionRef.current && screenTrack) {
        peerConnectionRef.current.addTrack(screenTrack, screenStream);
      }

      screenTrack.onended = stopScreenShare;
      screenStreamRef.current = screenStream;
      setScreenStream(screenStream);
      setIsScreenSharing(true);
      updateLocalParticipantState({ screenSharing: true });
      socketRef.current?.emit("screen-share-start", { roomId, meetingId });
      await renegotiatePeerConnection();
    } catch {
      setError("Could not start screen sharing.");
    }
  };

  const handleSendMessage = (event) => {
    event.preventDefault();

    if (!messageText.trim()) return;

    socketRef.current?.emit("meeting-message", { roomId, meetingId, content: messageText }, (response) => {
      if (!response?.ok) {
        setError(response?.message || "Could not send meeting message.");
      }
    });
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

  const handleModerationAction = (participant, action) => {
    if (!isMeetingModerator || !participant?.id || participant.id === user?.id) return;

    setModeratingParticipantId(`${participant.id}:${action}`);
    socketRef.current?.emit(
      "meeting-moderation-action",
      { roomId, meetingId, targetUserId: participant.id, action },
      (response) => {
        setModeratingParticipantId("");

        if (!response?.ok) {
          setError(response?.message || "Could not apply meeting moderation.");
        }
      }
    );
  };

  const visibleParticipants = useMemo(() => {
    const byId = new Map();
    const meetingParticipants =
      meeting?.participants?.filter((participant) => !participant.leftAt && participant.user).map(normalizeParticipant) || [];

    [...meetingParticipants, ...participants.map(normalizeParticipant)].forEach((participant) => {
      if (!participant.id) return;
      byId.set(participant.id, { ...byId.get(participant.id), ...participant });
    });

    if (user?.id && !byId.has(user.id)) {
      byId.set(
        user.id,
        normalizeParticipant({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl || "",
          live: true,
        })
      );
    }

    return Array.from(byId.values());
  }, [meeting?.participants, participants, user]);

  const typingNames = typingUsers.map((typingUser) => typingUser.name);
  const presentingParticipant = visibleParticipants.find((participant) => participant.live && participant.screenSharing);
  const isPresentationMode = !!presentingParticipant;
  const stripParticipants = presentingParticipant
    ? visibleParticipants.filter((participant) => participant.id !== presentingParticipant.id)
    : [];

  const renderAvatar = (participant, size = "h-20 w-20 text-2xl") => (
    <div className={`${size} grid place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender-200 to-mint-300 font-black text-navy-900 shadow-soft`}>
      {participant.avatarUrl ? (
        <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        getInitials(participant.name)
      )}
    </div>
  );

  const renderParticipantMedia = (participant, { compact = false, presentationStage = false } = {}) => {
    const isSelf = participant.id === user?.id;
    const isRemotePeer = !isSelf && participant.socketId === targetSocketIdRef.current;
    const hasLocalScreen = isSelf && participant.screenSharing && screenStream;
    const hasRemoteFeed = isRemotePeer && remoteStream && (participant.cameraOn || participant.screenSharing);
    const hasLocalVideo = !presentationStage && isSelf && isCameraOn && localStream?.getVideoTracks().length;
    const hasRemoteVideo = !presentationStage && hasRemoteFeed;
    const placeholderText = participant.screenSharing
      ? "Preparing presentation"
      : participant.cameraOn
        ? "Connecting video"
        : "Camera off";

    if (hasLocalScreen) {
      return <video ref={screenVideoRef} autoPlay playsInline muted className="h-full w-full object-contain" />;
    }

    if (presentationStage && hasRemoteFeed) {
      return <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" />;
    }

    if (hasLocalVideo) {
      return <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />;
    }

    if (hasRemoteVideo) {
      return <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />;
    }

    return (
      <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top_left,rgba(139,124,255,0.22),transparent_18rem),#111827] p-5">
        <div className="grid justify-items-center gap-3 text-center">
          {renderAvatar(participant, compact ? "h-12 w-12 text-sm" : "h-20 w-20 text-2xl")}
          <p className={`truncate font-semibold text-white ${compact ? "max-w-28 text-xs" : "max-w-44 text-sm"}`}>{placeholderText}</p>
        </div>
      </div>
    );
  };

  const renderParticipantTile = (participant, { compact = false } = {}) => {
    const isSelf = participant.id === user?.id;
    const isFocused = isSelf || participant.socketId === targetSocketIdRef.current;
    const isSpeaking = participant.live && participant.micOn && participant.speaking;

    return (
      <article
        key={participant.id}
        className={`relative grid overflow-hidden rounded-2xl border bg-slate-950 shadow-lift transition-all duration-300 ${
          compact ? "h-28 min-w-[170px] snap-start" : "min-h-[190px]"
        } ${
          isSpeaking
            ? "border-mint-300 ring-4 ring-mint-300/25"
            : isFocused
              ? "border-mint-300/50 ring-2 ring-mint-300/15"
              : "border-white/10"
        }`}
      >
        {renderParticipantMedia(participant, { compact })}
        {isSpeaking && (
          <div className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-mint-300/60 bg-mint-300/25 font-bold text-mint-100 shadow-soft backdrop-blur ${compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}>
            <Mic className="h-3.5 w-3.5 animate-pulse" />
            {!compact && <span>Speaking</span>}
          </div>
        )}
        <div className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent ${compact ? "px-2 py-2" : "px-3 py-3"}`}>
          <div className="min-w-0">
            <p className={`truncate font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}>{isSelf ? "You" : participant.name}</p>
            {!compact && <p className="truncate text-xs capitalize text-slate-300">{participant.role}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {participant.screenSharing && <MonitorUp className="h-4 w-4 text-mint-300" />}
            {participant.micOn ? <Mic className={`h-4 w-4 ${isSpeaking ? "animate-pulse text-mint-100" : "text-mint-300"}`} /> : <MicOff className="h-4 w-4 text-slate-300" />}
          </div>
        </div>
      </article>
    );
  };

  const renderPresentationStage = () => {
    const presenterIsSelf = presentingParticipant?.id === user?.id;

    return (
      <div className="grid min-h-0 flex-1 gap-3 transition-all duration-300 xl:grid-cols-[minmax(0,1fr)_220px]">
        <section className="relative min-h-[360px] overflow-hidden rounded-2xl border border-mint-300/45 bg-slate-950 shadow-lift ring-4 ring-mint-300/10 transition-all duration-300">
          <div className="absolute left-4 top-4 z-10 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-mint-300/40 bg-navy-950/80 px-3 py-2 text-sm font-semibold text-white shadow-soft backdrop-blur">
            <MonitorUp className="h-4 w-4 text-mint-300" />
            <span className="truncate">{presenterIsSelf ? "You are presenting" : `${presentingParticipant.name} is presenting`}</span>
          </div>
          <div className="h-full min-h-[360px] p-3 pt-16">
            <div className="grid h-full min-h-[290px] place-items-center overflow-hidden rounded-xl bg-black">
              {renderParticipantMedia(presentingParticipant, { presentationStage: true })}
            </div>
          </div>
        </section>

        <aside className="scroll-panel flex gap-3 overflow-x-auto pb-1 xl:max-h-[calc(100vh-12rem)] xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
          {stripParticipants.length ? (
            stripParticipants.map((participant) => renderParticipantTile(participant, { compact: true }))
          ) : (
            <div className="grid h-28 min-w-[170px] place-items-center rounded-2xl border border-white/10 bg-white/10 px-4 text-center text-sm text-slate-300 xl:min-w-0">
              Waiting for others
            </div>
          )}
        </aside>
      </div>
    );
  };

  const controlButtonClass = (active, danger = false) =>
    `relative grid h-12 w-12 place-items-center rounded-2xl border text-white shadow-soft transition hover:-translate-y-0.5 ${
      danger
        ? "border-red-400/40 bg-red-600 hover:bg-red-500"
        : active
          ? "border-mint-300/70 bg-mint-300/25 text-mint-100 ring-4 ring-mint-300/20"
          : "border-white/10 bg-white/12 hover:bg-white/18"
    }`;

  return (
    <section className="fixed inset-0 z-50 flex overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-soft-grid opacity-20 [background-size:36px_36px]" />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-2xl md:px-5">
          <div className="min-w-0">
            <Link to={`/rooms/${roomId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
              <ChevronLeft className="h-4 w-4" />
              Back to room
            </Link>
            <h1 className="mt-1 truncate text-lg font-semibold">{meeting?.title || "Meeting room"}</h1>
          </div>
          <div className="hidden min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200 sm:flex">
            <Circle className="h-2.5 w-2.5 fill-mint-300 text-mint-300" />
            <span className="truncate">{status}</span>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100 md:mx-5">
            {error}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-28 transition-all duration-300 md:p-5 md:pb-28">
          {isPresentationMode ? (
            renderPresentationStage()
          ) : (
            <div
              className={`grid auto-rows-fr gap-3 transition-all duration-300 ${
                visibleParticipants.length <= 1
                  ? "grid-cols-1"
                  : visibleParticipants.length <= 4
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              }`}
            >
              {visibleParticipants.map((participant) => renderParticipantTile(participant))}
            </div>
          )}
        </main>
      </div>

      {sidePanel && (
        <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l border-white/20 bg-white/95 text-slate-950 shadow-lift backdrop-blur-2xl sm:my-4 sm:mr-4 sm:rounded-2xl sm:border md:relative md:inset-auto md:z-20 md:my-0 md:mr-0 md:h-auto md:w-[380px] md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="inline-flex items-center gap-2 font-black text-navy-900">
              {sidePanel === "participants" ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              {sidePanel === "participants" ? "Participants" : "Meeting chat"}
            </h2>
            <button type="button" onClick={() => setSidePanel(null)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100" title="Close panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {sidePanel === "participants" && (
            <div className="scroll-panel min-h-0 flex-1 space-y-2 p-4">
              {visibleParticipants.map((participant) => (
                <div key={participant.id} className="rounded-xl border border-violet-100 bg-white px-3 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    {renderAvatar(participant, "h-11 w-11 text-sm")}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{participant.id === user?.id ? "You" : participant.name}</p>
                        <span className="rounded-full bg-lavender-200/55 px-2 py-0.5 text-[11px] font-bold capitalize text-navy-900">
                          {participant.role}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <Circle className={`h-2 w-2 ${participant.live ? "fill-mint-500 text-mint-500" : "fill-slate-300 text-slate-300"}`} />
                        {participant.speaking && participant.micOn ? "Speaking now" : participant.live ? "Live now" : "Offline"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <StatusIcon active={participant.micOn} label={participant.speaking && participant.micOn ? "Speaking" : participant.micOn ? "Mic on" : "Mic off"}>
                        {participant.micOn ? <Mic className={`h-3.5 w-3.5 ${participant.speaking ? "animate-pulse" : ""}`} /> : <MicOff className="h-3.5 w-3.5" />}
                      </StatusIcon>
                      <StatusIcon active={participant.cameraOn} label={participant.cameraOn ? "Camera on" : "Camera off"}>
                        {participant.cameraOn ? <Camera className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
                      </StatusIcon>
                      <StatusIcon active={participant.screenSharing} label={participant.screenSharing ? "Sharing screen" : "Not sharing"}>
                        <MonitorUp className="h-3.5 w-3.5" />
                      </StatusIcon>
                    </div>
                  </div>

                  {isMeetingModerator && participant.id !== user?.id && participant.live && (
                    <div className="mt-3 flex justify-end gap-1.5 border-t border-violet-100 pt-3">
                      <button
                        type="button"
                        onClick={() => handleModerationAction(participant, "mute")}
                        disabled={!participant.micOn || moderatingParticipantId === `${participant.id}:mute`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-violet-100 text-slate-600 transition hover:border-lavender-500 hover:bg-lavender-200/30 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Mute participant"
                      >
                        <MicOff className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationAction(participant, "cameraOff")}
                        disabled={!participant.cameraOn || moderatingParticipantId === `${participant.id}:cameraOff`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-violet-100 text-slate-600 transition hover:border-lavender-500 hover:bg-lavender-200/30 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Turn camera off"
                      >
                        <CameraOff className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationAction(participant, "stopScreenShare")}
                        disabled={!participant.screenSharing || moderatingParticipantId === `${participant.id}:stopScreenShare`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-violet-100 text-slate-600 transition hover:border-lavender-500 hover:bg-lavender-200/30 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Stop screen sharing"
                      >
                        <MonitorUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationAction(participant, "remove")}
                        disabled={moderatingParticipantId === `${participant.id}:remove`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-red-100 text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Remove from meeting"
                      >
                        <PhoneOff className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {sidePanel === "chat" && (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="scroll-panel flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-violet-100 bg-gradient-to-br from-white to-lavender-200/20 p-3">
                {messages.length ? (
                  messages.map((message) => {
                    const isMine = message.sender?.id === user?.id;

                    return (
                      <div key={message.id} className={isMine ? "text-right" : "text-left"}>
                        <div className={`inline-block max-w-[88%] rounded-2xl px-3 py-2 shadow-sm ${isMine ? "bg-navy-900 text-white" : "bg-white text-slate-900"}`}>
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
                  <div className="grid flex-1 place-items-center text-center text-sm text-slate-500">No meeting messages yet.</div>
                )}
              </div>

              <div className="mt-2 min-h-5 text-sm text-slate-500">
                {typingNames.length > 0 && `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`}
              </div>

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-2 rounded-xl border border-violet-100 bg-white p-2 shadow-soft">
                <input
                  type="text"
                  value={messageText}
                  onChange={handleMessageTextChange}
                  placeholder="Message meeting"
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm outline-none focus:border-lavender-200 focus:bg-white"
                />
                <button type="submit" className="btn-primary h-10 w-10 px-0" title="Send message">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </aside>
      )}

      <div className="pointer-events-none fixed right-4 top-20 z-40 flex max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-semibold text-navy-900 shadow-lift">
            {toast.message}
          </div>
        ))}
      </div>

      <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-lift backdrop-blur-2xl">
        <button type="button" onClick={toggleMicrophone} className={controlButtonClass(isMicOn)} title={isMicOn ? "Mute microphone" : "Unmute microphone"}>
          {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button type="button" onClick={toggleCamera} className={controlButtonClass(isCameraOn)} title={isCameraOn ? "Turn camera off" : "Turn camera on"}>
          {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </button>
        <button type="button" onClick={toggleScreenShare} className={controlButtonClass(isScreenSharing)} title={isScreenSharing ? "Stop sharing screen" : "Share screen"}>
          <MonitorUp className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setSidePanel(sidePanel === "participants" ? null : "participants")} className={controlButtonClass(sidePanel === "participants")} title="Participants">
          <Users className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => setSidePanel(sidePanel === "chat" ? null : "chat")} className={controlButtonClass(sidePanel === "chat")} title="Meeting chat">
          <MessageSquare className="h-5 w-5" />
          {unreadChatCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </span>
          )}
        </button>
        <button type="button" onClick={handleLeaveMeeting} disabled={isEnding} className={controlButtonClass(false, true)} title="Leave meeting">
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
      <AppFooter className="fixed bottom-1 left-0 right-0 z-30 text-slate-400" />
    </section>
  );
};

export default MeetingDetails;
