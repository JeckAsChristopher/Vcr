if (!localStorage.getItem("vc_token")) {
  alert("Unauthorized access.");
  window.location.href = "login.html";
  throw new Error("Unauthorized access blocked.");
}

const socket = io("https://shipped-interface-litigation-roof.trycloudflare.com");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusText = document.getElementById("status");

let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;
let otherUserId = null;
let tracksAdded = false;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Step 1: Get media and emit matchmaking request
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

// Step 2: On peer found, initiate or wait for offer
socket.on("call-found", (otherID) => {
  otherUserId = otherID;
  statusText.innerText = "Connected to random peer!";
  createPeerConnection();

  // Offerer logic
  if (socket.id < otherID) {
    addLocalTracksOnce();
    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer);
      socket.emit("signal", { to: otherUserId, data: { offer } });
    });
  }
});

// Step 3: Handle signaling
socket.on("signal", async ({ from, data }) => {
  otherUserId = from;

  if (!peerConnection) createPeerConnection();

  if (data.offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    addLocalTracksOnce();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { to: from, data: { answer } });
  }

  if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Error adding received ICE candidate", e);
    }
  }
});

// Add tracks only once
function addLocalTracksOnce() {
  if (tracksAdded || !peerConnection || !localStream) return;
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  tracksAdded = true;
}

// Step 4: Peer connection setup
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

// Step 5: Mute toggle with label update
function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  const btn = document.getElementById("muteButton");
  if (btn) btn.textContent = isMuted ? "Unmute" : "Mute";
}

// Step 6: End call and clean up
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

// Make global for buttons
window.toggleMute = toggleMute;
window.endCall = endCall;
