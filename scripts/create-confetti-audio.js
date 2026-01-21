import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import wavefile from 'wavefile';
const { WaveFile } = wavefile;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple celebration/confetti sound effect
// This generates a pleasant chime-like sound with multiple tones

function generateConfettiSound() {
  const sampleRate = 44100;
  const duration = 5; // 5 seconds
  const samples = sampleRate * duration;
  const channels = 2; // stereo
  
  // Create buffer for stereo audio
  const buffer = new Int16Array(samples * channels);
  
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    
    // Create a celebratory sound with multiple harmonics
    // Mix of frequencies that sound celebratory
    const freq1 = 523.25; // C5
    const freq2 = 659.25; // E5
    const freq3 = 783.99; // G5
    
    // Envelope to fade in and out
    const envelope = Math.sin(Math.PI * t / duration) * 0.3;
    
    // Decay over time
    const decay = Math.exp(-t * 1.5);
    
    // Generate harmonics
    let sample = 0;
    sample += Math.sin(2 * Math.PI * freq1 * t) * 0.4 * envelope * decay;
    sample += Math.sin(2 * Math.PI * freq2 * t) * 0.3 * envelope * decay;
    sample += Math.sin(2 * Math.PI * freq3 * t) * 0.3 * envelope * decay;
    
    // Add some sparkle with higher frequency bursts
    if (t < 0.5 || (t > 1 && t < 1.5) || (t > 2.5 && t < 3)) {
      sample += Math.sin(2 * Math.PI * 1046.50 * t) * 0.2 * envelope * decay;
    }
    
    // Convert to 16-bit integer
    const intSample = Math.max(-32768, Math.min(32767, sample * 32767));
    
    // Write to both stereo channels
    buffer[i * channels] = intSample;     // Left channel
    buffer[i * channels + 1] = intSample; // Right channel
  }
  
  // Create WAV file
  const wav = new WaveFile();
  wav.fromScratch(channels, sampleRate, '16', buffer);
  
  // Save to file
  const outputDir = path.join(__dirname, '../public/ANIMATION');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, 'confetti.wav');
  fs.writeFileSync(outputPath, wav.toBuffer());
  
  console.log('✅ Created confetti.wav audio file!');
  console.log(`📁 Saved to: ${outputPath}`);
  console.log('🔊 Audio will play when confetti animation triggers');
}

try {
  generateConfettiSound();
} catch (error) {
  console.error('Error generating audio:', error);
  console.log('⚠️  Please add your own audio file to public/ANIMATION/');
}