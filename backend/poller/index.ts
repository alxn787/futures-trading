// Bun WebSocket client to subscribe and log messages from Backpack Exchange (class-based)

const WS_URL = "wss://ws.backpack.exchange/";

type SubscribeMessage = {
  method: "SUBSCRIBE";
  params: string[];
  id: number;
};

class BackpackWsClient {
  private url: string;
  private subscribePayload: SubscribeMessage;
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxReconnectDelayMs = 30_000;
  private running = false;

  constructor(url: string, params: string[]) {
    this.url = url;
    this.subscribePayload = {
      method: "SUBSCRIBE",
      params,
      id: 1,
    };
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  public stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
      try {
        this.websocket.close(1000, "client shutdown");
      } catch {}
    }
    this.websocket = null;
  }

  private getReconnectDelayMs(attempt: number): number {
    const base = 1_000;
    const jitter = Math.floor(Math.random() * 300);
    const exp = Math.min(this.maxReconnectDelayMs, base * 2 ** Math.min(attempt, 5));
    return exp + jitter;
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.reconnectAttempts += 1;
    const delay = this.getReconnectDelayMs(this.reconnectAttempts);
    console.log(`[ws] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private connect(): void {
    if (!this.running) return;
    try {
      console.log(`[ws] connecting → ${this.url}`);
      this.websocket = new WebSocket(this.url);

      this.websocket.onopen = () => {
        this.reconnectAttempts = 0;
        console.log("[ws] connected. sending subscribe payload...");
        this.websocket?.send(JSON.stringify(this.subscribePayload));
      };

      this.websocket.onmessage = async (event: MessageEvent) => {
        try {
          let dataStr: string;
          if (typeof event.data === "string") {
            dataStr = event.data;
          } else if (event.data instanceof ArrayBuffer) {
            dataStr = Buffer.from(event.data).toString();
          } else if (typeof Blob !== "undefined" && event.data instanceof Blob) {
            const ab = await event.data.arrayBuffer();
            dataStr = Buffer.from(ab).toString();
          } else {
            dataStr = String(event.data);
          }
          console.log(`[ws] message: ${dataStr}`);
        } catch (err) {
          console.error("[ws] error parsing message", err);
        }
      };

      this.websocket.onerror = (event: Event) => {
        console.error("[ws] error", event);
      };

      this.websocket.onclose = (event: CloseEvent) => {
        console.warn(`[ws] closed (code=${event.code}, reason=${event.reason || ""}).`);
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error("[ws] connection error", err);
      this.scheduleReconnect();
    }
  }
}

// Instantiate and start
const client = new BackpackWsClient(WS_URL, ["bookTicker.SOL_USDC"]);
client.start();

// Graceful termination
process.on("SIGINT", () => {
  client.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  client.stop();
  process.exit(0);
});


