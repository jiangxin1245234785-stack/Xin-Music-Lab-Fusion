function nearestPowerOfTwo(value) {
    const bounded = Math.max(32, Math.min(32768, Math.round(value)));
    return 2 ** Math.round(Math.log2(bounded));
}
export class LiveAudioInput {
    context = null;
    analyser = null;
    stream = null;
    frameIndex = 0;
    frameSize;
    constructor(frameSize = 2048) {
        this.frameSize = nearestPowerOfTwo(frameSize);
    }
    get active() {
        return this.context !== null && this.analyser !== null && this.stream !== null;
    }
    async start() {
        if (this.active)
            return;
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Live microphone input is unavailable in this environment');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false
            },
            video: false
        });
        const context = new AudioContext({ latencyHint: 'interactive' });
        const analyser = context.createAnalyser();
        analyser.fftSize = this.frameSize;
        analyser.smoothingTimeConstant = 0;
        context.createMediaStreamSource(stream).connect(analyser);
        this.stream = stream;
        this.context = context;
        this.analyser = analyser;
        this.frameIndex = 0;
    }
    readFrame() {
        if (!this.context || !this.analyser)
            return null;
        const samples = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(samples);
        const frameIndex = this.frameIndex++;
        return {
            frameIndex,
            sampleOffset: frameIndex * samples.length,
            sampleRate: this.context.sampleRate,
            samples
        };
    }
    async stop() {
        this.stream?.getTracks().forEach(track => track.stop());
        const context = this.context;
        this.stream = null;
        this.analyser = null;
        this.context = null;
        this.frameIndex = 0;
        if (context && context.state !== 'closed')
            await context.close();
    }
}
//# sourceMappingURL=live-input.js.map