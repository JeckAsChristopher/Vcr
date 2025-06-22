if (!localStorage.getItem("vc_token")) {
  alert("Unauthorized access.");
  window.location.href = "login.html";
  throw new Error("Unauthorized access blocked.");
}

const socket = io("https://shipped-interface-litigation-roof.trycloudflare.com"); // Change to your server if deployed
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusText = document.getElementById("status");

let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let otherUserId = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Step 1: Get user media and join matchmaking
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    socket.emit("find-call");
    statusText.innerText = "Finding random calls...";
  })
  .catch(err => {
    console.error("Media access denied:", err);
    alert("Camera/microphone access is required.");
  });

// Step 2: Matched with another user
socket.on("call-found", (otherID) => {
  otherUserId = otherID;
  statusText.innerText = "Connected to random peer!";
  createPeerConnection();

  // Offerer logic: only one sends offer
  if (socket.id < otherID) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer);
      socket.emit("signal", { to: otherUserId, data: { offer } });
    });
  }
});

// Step 3: Signaling handling
socket.on("signal", async ({ from, data }) => {
  otherUserId = from;

  if (!peerConnection) {
    createPeerConnection();
  }

  if (data.offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { to: from, data: { answer } });
  }

  if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// Step 4: Create peer connection
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && otherUserId) {
      socket.emit("signal", {
        to: otherUserId,
        data: { candidate: event.candidate }
      });
    }
  };

  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    remoteStream.addTrack(event.track);
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "disconnected" || state === "failed" || state === "closed") {
      endCall();
    }
  };
}

// Step 5: Toggle mute
function toggleMute() {
  isMuted = !isMuted;

  // Enable or disable audio tracks
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  // Update button label
  const btn = document.getElementById("muteButton");
  btn.textContent = isMuted ? "Unmute" : "Mute";
}

// Step 6: End the call
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
    remoteStream = null;
  }

  if (remoteVideo) remoteVideo.srcObject = null;
  if (statusText) statusText.innerText = "Call ended.";

  setTimeout(() => {
    location.href = "/";
  }, 1000);
}

// Make buttons usable from HTML
window.toggleMute = toggleMute;
window.endCall = endCall;