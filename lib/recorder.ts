// Microphone capture with MediaRecorder. The stream is released after every
// recording so iOS routes playback back to the loud speaker.

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/aac", ext: "m4a" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

export type Recording = { blob: Blob; filename: string; duration: number };

export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private started = 0;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const { mime } = pickMime();
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.started = performance.now();

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      src.connect(this.analyser);
    } catch {}
  }

  /** 0..1 loudness for the live level meter. */
  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
  }

  stop(): Promise<Recording> {
    return new Promise((resolve) => {
      const rec = this.rec;
      const done = () => {
        const type = rec?.mimeType || pickMime().mime || "audio/webm";
        const ext = type.includes("mp4") ? "mp4" : type.includes("aac") ? "m4a" : "webm";
        const blob = new Blob(this.chunks, { type });
        const duration = performance.now() - this.started;
        this.release();
        resolve({ blob, filename: `speech.${ext}`, duration });
      };
      if (!rec || rec.state === "inactive") return done();
      rec.onstop = done;
      rec.stop();
    });
  }

  cancel() {
    try {
      this.rec?.stop();
    } catch {}
    this.release();
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.rec = null;
    this.ctx = null;
    this.analyser = null;
  }
}
