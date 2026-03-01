class AudioController {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private isMusicEnabled = true;
  private isSfxEnabled = true;
  private musicInterval: number | null = null;
  private notes = [261.63, 293.66, 329.63, 392.00, 440.00]; // C4, D4, E4, G4, A4 (Pentatonic)

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.05; // Very subtle
    this.musicGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.2;
    this.sfxGain.connect(this.ctx.destination);
  }

  setMusicEnabled(enabled: boolean) {
    this.isMusicEnabled = enabled;
    if (enabled) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  setSfxEnabled(enabled: boolean) {
    this.isSfxEnabled = enabled;
  }

  startMusic() {
    if (!this.ctx) return; // Will be initialized on first click
    if (!this.isMusicEnabled) return;
    if (this.musicInterval) return;

    const playNote = () => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      // Random pentatonic note, sometimes an octave higher
      const baseFreq = this.notes[Math.floor(Math.random() * this.notes.length)];
      osc.frequency.value = baseFreq * (Math.random() > 0.7 ? 2 : 1);
      
      osc.connect(gain);
      gain.connect(this.musicGain);
      
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 2);
      gain.gain.linearRampToValueAtTime(0, now + 6);
      
      osc.start(now);
      osc.stop(now + 6);
    };

    // Play a note every 2.5 seconds for a generative ambient feel
    this.musicInterval = window.setInterval(playNote, 2500);
    playNote();
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  playSfx(type: 'pop' | 'chime' | 'thud' | 'win' | 'sparkle') {
    if (!this.ctx) this.init();
    if (!this.isSfxEnabled || !this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;

    if (type === 'pop') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.1);
    } 
    else if (type === 'chime') {
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.3, now + i * 0.1 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 1);
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 1);
      });
    }
    else if (type === 'thud') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
      
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);
    }
    else if (type === 'win') {
      const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
      freqs.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 2);
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 2);
      });
    }
    else if (type === 'sparkle') {
      for (let i = 0; i < 5; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 800 + Math.random() * 1000;
        
        const startTime = now + i * 0.05;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      }
    }
  }
}

export const audio = new AudioController();
