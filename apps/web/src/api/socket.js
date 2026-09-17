import { io } from "socket.io-client";
export const connectRealtime = (token) =>
  io(
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, "") ||
      "http://localhost:5000",
    { auth: { token }, transports: ["websocket"] },
  );
