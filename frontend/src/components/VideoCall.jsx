import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../hooks/useAuth";

const peerConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const mediaErrorMessage =
  "No camera/microphone found. Please connect a device or allow permissions.";

const VideoCall = ({ roomId }) => {
  const { token } = useAuth();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraVideoTrackRef = useRef(null);
  const targetSocketIdRef = useRef(null);
  const isScreenSharingRef = useRef(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [remoteUserName, setRemoteUserName] = useState("");
  const [status, setStatus] = useState("Ready to start a two-person call.");
  const [error, setError] = useState("");

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
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setRemoteUserName("");
  }, []);

  const leaveCall = useCallback(() => {
    socketRef.current?.emit("leave-call", { roomId });
    socketRef.current?.disconnect();
    socketRef.current = null;

    resetPeerConnection();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    setLocalStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsInCall(false);
    setStatus("Ready to start a two-person call.");
  }, [roomId, resetPeerConnection]);

  useEffect(() => {
    return () => {
      socketRef.current?.emit("leave-call", { roomId });
      socketRef.current?.disconnect();
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [roomId]);

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
            targetSocketId: targetSocketIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;

        if (stream) {
          remoteStreamRef.current = stream;
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
    [roomId, resetPeerConnection]
  );

  const registerSocketEvents = useCallback(
    (socket) => {
      socket.on("connect_error", (socketError) => {
        setError(socketError.message || "Could not connect to call signaling.");
        setStatus("Call signaling failed.");
      });

      socket.on("call-user-joined", ({ user, socketId }) => {
        setRemoteUserName(user?.name || "Remote participant");
        setStatus(`${user?.name || "A participant"} joined the call.`);
        targetSocketIdRef.current = socketId;
      });

      socket.on("call-user-left", ({ socketId }) => {
        if (!targetSocketIdRef.current || targetSocketIdRef.current === socketId) {
          resetPeerConnection();
          setStatus("Remote participant left the call.");
        }
      });

      socket.on("offer", async ({ offer, fromSocketId, user }) => {
        try {
          setRemoteUserName(user?.name || "Remote participant");
          const peerConnection = createPeerConnection(fromSocketId);

          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit("answer", {
            roomId,
            targetSocketId: fromSocketId,
            answer,
          });

          setStatus("Answer sent. Connecting...");
        } catch {
          setError("Could not answer the incoming call.");
        }
      });

      socket.on("answer", async ({ answer }) => {
        try {
          await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
          setStatus("Answer received. Connecting...");
        } catch {
          setError("Could not complete the call answer.");
        }
      });

      socket.on("ice-candidate", async ({ candidate }) => {
        try {
          if (peerConnectionRef.current && candidate) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch {
          setError("Could not add network candidate for the call.");
        }
      });
    },
    [createPeerConnection, resetPeerConnection, roomId]
  );

  const startCall = async () => {
    if (!roomId || !token) {
      return;
    }

    setError("");
    setStatus("Requesting camera and microphone...");

    try {
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(stream.getVideoTracks().some((track) => track.enabled));
      setIsMicOn(stream.getAudioTracks().some((track) => track.enabled));

      const socket = io("http://localhost:5000", {
        auth: { token },
      });

      socketRef.current = socket;
      registerSocketEvents(socket);

      socket.on("connect", () => {
        socket.emit("join-call", { roomId }, async (response) => {
          if (!response?.ok) {
            setError(response?.message || "Could not join the call.");
            leaveCall();
            return;
          }

          setIsInCall(true);

          const [existingUser] = response.users || [];

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
            targetSocketId: existingUser.socketId,
            offer,
          });

          setStatus("Offer sent. Waiting for answer...");
        });
      });
    } catch (mediaError) {
      setError(mediaError.message || mediaErrorMessage);
      setStatus("Unable to start call.");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setIsCameraOn(false);
      setIsMicOn(false);
    }
  };

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

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Video call</h2>
          <p className="mt-1 text-sm text-slate-500">{status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isInCall ? (
            <button
              type="button"
              onClick={startCall}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Start call
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleCamera}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {isCameraOn ? "Camera off" : "Camera on"}
              </button>
              <button
                type="button"
                onClick={toggleMicrophone}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {isMicOn ? "Mic off" : "Mic on"}
              </button>
              <button
                type="button"
                onClick={leaveCall}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Leave call
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-sm text-white">
            <span>You</span>
            <span>{isMicOn ? "Mic on" : "Mic off"}</span>
          </div>
          <div className="grid aspect-video place-items-center">
            {localStream ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            ) : (
              <p className="px-4 text-center text-sm text-slate-300">Local media preview</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-sm text-white">
            <span>{remoteUserName || "Remote participant"}</span>
            <span>{remoteStream ? "Connected" : "Waiting"}</span>
          </div>
          <div className="grid aspect-video place-items-center">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            ) : (
              <p className="px-4 text-center text-sm text-slate-300">
                Remote video/audio will appear here when another participant joins.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default VideoCall;
