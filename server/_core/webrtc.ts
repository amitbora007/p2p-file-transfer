import { Server as HTTPServer } from "http";
import WebRTCSignalingService from "../services/webrtcSignaling";

let signalingService: WebRTCSignalingService | null = null;

export function initializeWebRTC(httpServer: HTTPServer): WebRTCSignalingService {
  if (signalingService) {
    return signalingService;
  }

  signalingService = new WebRTCSignalingService(httpServer);
  console.log("[WebRTC] Signaling service initialized");

  return signalingService;
}

export function getWebRTCService(): WebRTCSignalingService | null {
  return signalingService;
}
